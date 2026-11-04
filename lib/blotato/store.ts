import "server-only"
import type { createServerClient } from "@insforge/sdk/ssr"
import { BlotatoClient, BlotatoError } from "@/lib/blotato/client"
import { deleteConnection, getApiKey, getConnection, getConnectionFor, markInvalid, saveAccounts, saveConnection } from "@/lib/integrations/store"
import type { SocialAccount } from "@/lib/integrations/types"

/* A user's Blotato connection. Storage is shared with the other integrations (lib/integrations/store.ts). */

type DatabaseClient = { database: ReturnType<typeof createServerClient>["database"] }

/** The signed-in user's connection (no key), or null. */
export const getBlotatoConnection = (client: DatabaseClient) => getConnection(client, "blotato")

/** Same as getBlotatoConnection, for background jobs that have no signed-in user. */
export const getBlotatoConnectionFor = (userId: string) => getConnectionFor("blotato", userId)

/** The user's decrypted API key, or null. Server-only. */
export const getBlotatoApiKey = (userId: string) => getApiKey("blotato", userId)

/** A client for the user's own Blotato account, or null if they haven't connected it. */
export async function blotatoFor(userId: string) {
  const key = await getBlotatoApiKey(userId)
  return key ? new BlotatoClient(key) : null
}

export const saveBlotatoConnection = (userId: string, apiKey: string, details: { blotatoUserId: string; plan: string | null; accounts: SocialAccount[] }) =>
  saveConnection("blotato", userId, apiKey, { plan: details.plan, accounts: details.accounts, extra: { blotato_user_id: details.blotatoUserId || null } })

export const deleteBlotatoConnection = (userId: string) => deleteConnection("blotato", userId)

export const markBlotatoInvalid = (userId: string, message: string) => markInvalid("blotato", userId, message)

/**
 * Fetches the user's connected accounts from Blotato and saves them. Throws BlotatoError when
 * Blotato fails; a rejected key is also marked invalid.
 */
export async function syncBlotatoAccounts(userId: string): Promise<SocialAccount[]> {
  const client = await blotatoFor(userId)
  if (!client) throw new BlotatoError("Connect Blotato in Settings → Integrations first.", 404)
  let accounts: SocialAccount[]
  try {
    accounts = await client.listAccounts()
  } catch (error) {
    if (error instanceof BlotatoError && error.isAuthError) await markBlotatoInvalid(userId, error.message)
    throw error
  }
  await saveAccounts("blotato", userId, accounts)
  return accounts
}
