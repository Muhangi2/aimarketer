"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { BlotatoClient, BlotatoError } from "@/lib/blotato/client"
import { deleteBlotatoConnection, saveBlotatoConnection, syncBlotatoAccounts } from "@/lib/blotato/store"
import { EncryptionKeyError } from "@/lib/integrations/crypto"
import { getConnectionFor } from "@/lib/integrations/store"
import { INTEGRATION_PROVIDERS, type IntegrationConnection, type IntegrationProvider } from "@/lib/integrations/types"
import { PostizError } from "@/lib/postiz/client"
import { connectPostizKey, deletePostizConnection, syncPostizAccounts } from "@/lib/postiz/store"

type Result = { ok: true; connection: IntegrationConnection | null } | { ok: false; error: string }

const providerSchema = z.enum(INTEGRATION_PROVIDERS)
// Keys can end in "=", which must be kept
const apiKeySchema = z.string().trim().min(10, "Paste your API key.").max(500).regex(/^\S+$/, "API keys don't contain spaces.")

const NAMES: Record<IntegrationProvider, string> = { blotato: "Blotato", postiz: "Postiz" }

async function currentUserId() {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  if (!data?.user) redirect("/sign-in")
  return data.user.id
}

function refresh() {
  revalidatePath("/dashboard/settings/integrations")
  revalidatePath("/dashboard/accounts")
  revalidatePath("/dashboard/posts/new")
}

function failure(error: unknown, fallback: string): Result {
  if (error instanceof BlotatoError || error instanceof PostizError) return { ok: false, error: error.message }
  if (error instanceof EncryptionKeyError) {
    console.error(error.message)
    return { ok: false, error: "The server isn't set up to store API keys yet (INTEGRATIONS_ENCRYPTION_KEY is missing)." }
  }
  console.error(fallback, error)
  return { ok: false, error: fallback }
}

/** Checks the key with the service, then stores it encrypted along with the user's connected accounts. */
export async function connectIntegration(provider: IntegrationProvider, apiKey: string): Promise<Result> {
  const which = providerSchema.safeParse(provider)
  if (!which.success) return { ok: false, error: "Unknown integration." }
  const parsed = apiKeySchema.safeParse(apiKey)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid API key." }
  const userId = await currentUserId()

  try {
    if (which.data === "blotato") {
      const client = new BlotatoClient(parsed.data)
      const user = await client.getUser()
      const accounts = await client.listAccounts()
      await saveBlotatoConnection(userId, parsed.data, { blotatoUserId: user.id, plan: user.subscriptionPlan, accounts })
    } else {
      await connectPostizKey(userId, parsed.data)
    }
    refresh()
    return { ok: true, connection: await getConnectionFor(which.data, userId) }
  } catch (error) {
    return failure(error, `Couldn't connect ${NAMES[which.data]}. Please try again.`)
  }
}

/** Fetches the accounts the user connected on the service again. */
export async function refreshIntegrationAccounts(provider: IntegrationProvider): Promise<Result> {
  const which = providerSchema.safeParse(provider)
  if (!which.success) return { ok: false, error: "Unknown integration." }
  const userId = await currentUserId()
  try {
    await (which.data === "blotato" ? syncBlotatoAccounts(userId) : syncPostizAccounts(userId))
    refresh()
    return { ok: true, connection: await getConnectionFor(which.data, userId) }
  } catch (error) {
    refresh()
    return failure(error, "Couldn't refresh your accounts. Please try again.")
  }
}

/** Forgets the key and accounts. Without Blotato, scheduled posts fail until it's connected again. */
export async function disconnectIntegration(provider: IntegrationProvider): Promise<Result> {
  const which = providerSchema.safeParse(provider)
  if (!which.success) return { ok: false, error: "Unknown integration." }
  const userId = await currentUserId()
  try {
    await (which.data === "blotato" ? deleteBlotatoConnection(userId) : deletePostizConnection(userId))
    refresh()
    return { ok: true, connection: null }
  } catch (error) {
    return failure(error, `Couldn't disconnect ${NAMES[which.data]}. Please try again.`)
  }
}
