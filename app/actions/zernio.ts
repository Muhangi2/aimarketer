"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { ZernioError } from "@/lib/zernio/client"
import { syncZernioAccounts, zernioFor } from "@/lib/zernio/store"

type Result = { ok: true } | { ok: false; error: string }

async function currentUserId() {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  if (!data?.user) redirect("/sign-in")
  return data.user.id
}

function refresh() {
  revalidatePath("/dashboard/accounts")
  revalidatePath("/dashboard/settings/integrations")
  revalidatePath("/dashboard/posts/new")
  revalidatePath("/dashboard/inbox")
}

function failure(error: unknown, fallback: string): Result {
  if (error instanceof ZernioError) return { ok: false, error: error.message }
  console.error(fallback, error)
  return { ok: false, error: fallback }
}

export async function refreshZernioAccounts(): Promise<Result> {
  const userId = await currentUserId()
  try {
    await syncZernioAccounts(userId)
    refresh()
    return { ok: true }
  } catch (error) {
    return failure(error, "Couldn't refresh your accounts. Please try again.")
  }
}

/** Disconnects one of the user's own accounts. Scheduled posts to it will fail until it's connected again. */
export async function disconnectZernioAccount(accountId: string): Promise<Result> {
  const userId = await currentUserId()
  try {
    const zernio = await zernioFor(userId)
    // Only accounts on the user's own profile (their key couldn't reach others anyway)
    const accounts = zernio ? await zernio.client.listAccounts(zernio.profile.profileId) : []
    if (!zernio || !accounts.some((a) => a.id === accountId)) return { ok: false, error: "Account not found." }
    await zernio.client.disconnectAccount(accountId)
    await syncZernioAccounts(userId)
    refresh()
    return { ok: true }
  } catch (error) {
    return failure(error, "Couldn't disconnect the account. Please try again.")
  }
}
