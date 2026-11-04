import "server-only"
import type { createServerClient } from "@insforge/sdk/ssr"
import { getInsForgeAdmin } from "@/lib/insforge/admin"
import { decryptSecret, encryptSecret } from "@/lib/integrations/crypto"
import type { SocialAccount } from "@/lib/integrations/types"
import { ZernioClient, ZernioError, zernioConfigured } from "@/lib/zernio/client"

/*
 * Each user's Zernio profile. The row (profile id, accounts) is readable by its owner through
 * RLS; the profile's scoped keys are in zernio_profile_secret, which only the admin client reads.
 * Every admin query filters by user_id itself.
 */

type DatabaseClient = { database: ReturnType<typeof createServerClient>["database"] }
type Row = Record<string, unknown>

export type ZernioProfile = { profileId: string; accounts: SocialAccount[]; accountsRefreshedAt: string | null }

const db = () => getInsForgeAdmin().database

function toAccounts(value: unknown): SocialAccount[] {
  if (!Array.isArray(value)) return []
  return (value as Row[]).map((a) => ({
    id: String(a.id),
    platform: String(a.platform),
    fullname: String(a.fullname ?? ""),
    username: String(a.username ?? ""),
    picture: a.picture ? String(a.picture) : null,
    needsReconnection: a.needsReconnection === true,
  }))
}

const toProfile = (r: Row): ZernioProfile => ({
  profileId: String(r.profile_id),
  accounts: toAccounts(r.accounts),
  accountsRefreshedAt: r.accounts_refreshed_at ? new Date(String(r.accounts_refreshed_at)).toISOString() : null,
})

/** The signed-in user's profile, or null if they haven't connected anything yet. RLS keeps it to their own. */
export async function getZernioProfile(client: DatabaseClient): Promise<ZernioProfile | null> {
  const { data, error } = await client.database.from("zernio_profile").select("profile_id, accounts, accounts_refreshed_at").maybeSingle()
  if (error) {
    console.error("Could not load the Zernio profile", error)
    return null
  }
  return data ? toProfile(data as Row) : null
}

/** Same as getZernioProfile, for background jobs and server actions acting for a user. */
export async function getZernioProfileFor(userId: string): Promise<ZernioProfile | null> {
  const { data, error } = await db().from("zernio_profile").select("profile_id, accounts, accounts_refreshed_at").eq("user_id", userId).maybeSingle()
  if (error) throw new Error(`Could not load the Zernio profile: ${error.message}`)
  return data ? toProfile(data as Row) : null
}

async function getKeys(userId: string) {
  const { data, error } = await db().from("zernio_profile_secret").select("write_key_encrypted, read_key_encrypted").eq("user_id", userId).maybeSingle()
  if (error) throw new Error(`Could not load the Zernio keys: ${error.message}`)
  if (!data) return null
  const row = data as Row
  return { write: decryptSecret(String(row.write_key_encrypted)), read: decryptSecret(String(row.read_key_encrypted)) }
}

/**
 * The user's profile, created with its scoped keys on first use. Only the app key can do this;
 * everything afterwards uses the profile's own keys.
 */
export async function ensureZernioProfile(userId: string, displayName: string): Promise<ZernioProfile> {
  const existing = await getZernioProfileFor(userId)
  if (existing && (await getKeys(userId))) return existing

  const app = ZernioClient.app()
  const profileId = existing?.profileId ?? (await app.ensureProfile(userId, displayName))
  const write = await app.createProfileKey(profileId, "read-write", `user-${userId}-app`)
  const read = await app.createProfileKey(profileId, "read", `user-${userId}-agents`)

  const { error } = await db().from("zernio_profile").upsert([{ user_id: userId, profile_id: profileId }], { onConflict: "user_id" })
  if (error) throw new Error(`Could not save the Zernio profile: ${error.message}`)
  const { error: secretError } = await db()
    .from("zernio_profile_secret")
    .upsert(
      [{ user_id: userId, write_key_id: write.id, write_key_encrypted: encryptSecret(write.key), read_key_id: read.id, read_key_encrypted: encryptSecret(read.key), updated_at: new Date().toISOString() }],
      { onConflict: "user_id" }
    )
  if (secretError) throw new Error(`Could not save the Zernio keys: ${secretError.message}`)
  return { profileId, accounts: existing?.accounts ?? [], accountsRefreshedAt: existing?.accountsRefreshedAt ?? null }
}

/** A client limited to the user's own profile (read-write), or null if they have none yet. */
export async function zernioFor(userId: string) {
  if (!zernioConfigured()) return null
  const [profile, keys] = await Promise.all([getZernioProfileFor(userId), getKeys(userId)])
  return profile && keys ? { client: new ZernioClient(keys.write), profile } : null
}

/** The user's read-only key, for the chat agents' MCP tools. */
export async function getZernioReadKey(userId: string) {
  if (!zernioConfigured()) return null
  return (await getKeys(userId))?.read ?? null
}

/** Fetches the user's connected accounts from Zernio and saves them. */
export async function syncZernioAccounts(userId: string): Promise<SocialAccount[]> {
  const zernio = await zernioFor(userId)
  if (!zernio) throw new ZernioError("Connect an account first.", 404)
  const accounts = await zernio.client.listAccounts(zernio.profile.profileId)
  const { error } = await db()
    .from("zernio_profile")
    .update({ accounts, accounts_refreshed_at: new Date().toISOString() })
    .eq("user_id", userId)
  if (error) throw new Error(`Could not save the accounts: ${error.message}`)
  return accounts
}
