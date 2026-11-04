import "server-only"
import type { createServerClient } from "@insforge/sdk/ssr"
import { getBlotatoConnection, getBlotatoConnectionFor } from "@/lib/blotato/store"
import { publishingAccounts, type PublishingAccount } from "@/lib/posts/targets"
import { getZernioProfile, getZernioProfileFor } from "@/lib/zernio/store"

type DatabaseClient = { database: ReturnType<typeof createServerClient>["database"] }

export type PublishingSetup = {
  accounts: PublishingAccount[]
  // Blotato's saved key stopped working: its accounts can't publish until it's replaced
  blotatoInvalid: boolean
}

/** The signed-in user's accounts that can publish (RLS keeps it to their own). */
export async function getPublishingSetup(client: DatabaseClient): Promise<PublishingSetup> {
  const [zernio, blotato] = await Promise.all([getZernioProfile(client), getBlotatoConnection(client)])
  return { accounts: publishingAccounts(zernio?.accounts ?? [], blotato?.accounts ?? []), blotatoInvalid: blotato?.status === "invalid" }
}

/** Same as getPublishingSetup, for background jobs. */
export async function getPublishingSetupFor(userId: string): Promise<PublishingSetup> {
  const [zernio, blotato] = await Promise.all([getZernioProfileFor(userId), getBlotatoConnectionFor(userId)])
  return { accounts: publishingAccounts(zernio?.accounts ?? [], blotato?.accounts ?? []), blotatoInvalid: blotato?.status === "invalid" }
}
