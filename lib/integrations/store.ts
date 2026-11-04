import "server-only"
import type { createServerClient } from "@insforge/sdk/ssr"
import { getInsForgeAdmin } from "@/lib/insforge/admin"
import { decryptSecret, encryptSecret } from "@/lib/integrations/crypto"
import type { IntegrationConnection, IntegrationProvider, SocialAccount } from "@/lib/integrations/types"

/*
 * A user's connection to a posting service (<provider>_connection tables). The details (accounts,
 * key hint) are readable by the owner through RLS; the encrypted key is in
 * <provider>_connection_secret, which only the admin client can read. Every admin query here
 * filters by user_id itself.
 */

type DatabaseClient = { database: ReturnType<typeof createServerClient>["database"] }
type Row = Record<string, unknown>

const COLUMNS = "key_hint, plan, status, accounts, accounts_refreshed_at, last_error, created_at"
const table = (provider: IntegrationProvider) => `${provider}_connection`
const secretTable = (provider: IntegrationProvider) => `${provider}_connection_secret`
const db = () => getInsForgeAdmin().database

function toAccounts(value: unknown): SocialAccount[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((a): a is Row => Boolean(a) && typeof a === "object")
    .map((a) => ({ id: String(a.id), platform: String(a.platform), fullname: String(a.fullname ?? ""), username: String(a.username ?? "") }))
}

function toConnection(r: Row): IntegrationConnection {
  return {
    keyHint: String(r.key_hint),
    plan: r.plan ? String(r.plan) : null,
    status: r.status === "invalid" ? "invalid" : "active",
    accounts: toAccounts(r.accounts),
    accountsRefreshedAt: r.accounts_refreshed_at ? new Date(String(r.accounts_refreshed_at)).toISOString() : null,
    lastError: r.last_error ? String(r.last_error) : null,
    connectedAt: new Date(String(r.created_at)).toISOString(),
  }
}

/** The signed-in user's connection (no key), or null. RLS keeps it to their own. */
export async function getConnection(client: DatabaseClient, provider: IntegrationProvider): Promise<IntegrationConnection | null> {
  const { data, error } = await client.database.from(table(provider)).select(COLUMNS).maybeSingle()
  if (error) {
    console.error(`Could not load the ${provider} connection`, error)
    return null
  }
  return data ? toConnection(data as Row) : null
}

/** Same as getConnection, for background jobs that have no signed-in user. */
export async function getConnectionFor(provider: IntegrationProvider, userId: string): Promise<IntegrationConnection | null> {
  const { data, error } = await db().from(table(provider)).select(COLUMNS).eq("user_id", userId).maybeSingle()
  if (error) throw new Error(`Could not load the ${provider} connection: ${error.message}`)
  return data ? toConnection(data as Row) : null
}

/** The user's decrypted API key, or null if they haven't connected. Server-only. */
export async function getApiKey(provider: IntegrationProvider, userId: string): Promise<string | null> {
  const { data, error } = await db().from(secretTable(provider)).select("api_key_encrypted").eq("user_id", userId).maybeSingle()
  if (error) throw new Error(`Could not load the ${provider} key: ${error.message}`)
  return data ? decryptSecret(String((data as Row).api_key_encrypted)) : null
}

const keyHint = (apiKey: string) => apiKey.replace(/=+$/, "").slice(-4)

/** Saves a key that was just checked with the provider, with the accounts it returned. */
export async function saveConnection(
  provider: IntegrationProvider,
  userId: string,
  apiKey: string,
  details: { plan: string | null; accounts: SocialAccount[]; extra?: Row }
) {
  const now = new Date().toISOString()
  const { error } = await db()
    .from(table(provider))
    .upsert(
      [
        {
          user_id: userId,
          key_hint: keyHint(apiKey),
          plan: details.plan,
          status: "active",
          accounts: details.accounts,
          accounts_refreshed_at: now,
          last_error: null,
          ...details.extra,
        },
      ],
      { onConflict: "user_id" }
    )
  if (error) throw new Error(`Could not save the ${provider} connection: ${error.message}`)

  const { error: secretError } = await db()
    .from(secretTable(provider))
    .upsert([{ user_id: userId, api_key_encrypted: encryptSecret(apiKey), updated_at: now }], { onConflict: "user_id" })
  if (secretError) throw new Error(`Could not save the ${provider} key: ${secretError.message}`)
}

export async function deleteConnection(provider: IntegrationProvider, userId: string) {
  // The secret row goes with it (ON DELETE CASCADE)
  const { error } = await db().from(table(provider)).delete().eq("user_id", userId)
  if (error) throw new Error(`Could not remove the ${provider} connection: ${error.message}`)
}

/** Records that the provider rejected the key, so the UI asks for a new one. */
export async function markInvalid(provider: IntegrationProvider, userId: string, message: string) {
  await db().from(table(provider)).update({ status: "invalid", last_error: message }).eq("user_id", userId)
}

export async function saveAccounts(provider: IntegrationProvider, userId: string, accounts: SocialAccount[]) {
  const { error } = await db()
    .from(table(provider))
    .update({ accounts, accounts_refreshed_at: new Date().toISOString(), status: "active", last_error: null })
    .eq("user_id", userId)
  if (error) throw new Error(`Could not save the accounts: ${error.message}`)
}
