import "server-only"
import type { createServerClient } from "@insforge/sdk/ssr"
import { PostizClient, PostizError } from "@/lib/postiz/client"
import { deleteConnection, getApiKey, getConnection, getConnectionFor, markInvalid, saveAccounts, saveConnection } from "@/lib/integrations/store"
import type { SocialAccount } from "@/lib/integrations/types"

/* A user's Postiz connection. Storage is shared with the other integrations (lib/integrations/store.ts). */

type DatabaseClient = { database: ReturnType<typeof createServerClient>["database"] }

export const getPostizConnection = (client: DatabaseClient) => getConnection(client, "postiz")
export const getPostizConnectionFor = (userId: string) => getConnectionFor("postiz", userId)
export const getPostizApiKey = (userId: string) => getApiKey("postiz", userId)
export const deletePostizConnection = (userId: string) => deleteConnection("postiz", userId)

/** Checks the key by listing the user's channels, then stores it encrypted with them. */
export async function connectPostizKey(userId: string, apiKey: string) {
  const accounts = await new PostizClient(apiKey).listChannels()
  await saveConnection("postiz", userId, apiKey, { plan: null, accounts })
}

/** Fetches the user's channels from Postiz again. A rejected key is marked invalid. */
export async function syncPostizAccounts(userId: string): Promise<SocialAccount[]> {
  const key = await getPostizApiKey(userId)
  if (!key) throw new PostizError("Connect Postiz in Settings → Integrations first.", 404)
  let accounts: SocialAccount[]
  try {
    accounts = await new PostizClient(key).listChannels()
  } catch (error) {
    if (error instanceof PostizError && error.isAuthError) await markInvalid("postiz", userId, error.message)
    throw error
  }
  await saveAccounts("postiz", userId, accounts)
  return accounts
}
