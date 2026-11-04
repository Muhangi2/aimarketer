"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { syncAnalyticsFor } from "@/lib/analytics/sync"
import { ZernioError } from "@/lib/zernio/client"

export type SyncActionResult = { ok: true; message: string } | { ok: false; error: string }

/** The Analytics page's Sync button: fetches the selected range's numbers from Zernio now. */
export async function syncAnalyticsNow(days: number): Promise<SyncActionResult> {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  if (!data?.user) redirect("/sign-in")

  const span = Number.isFinite(days) ? Math.max(7, Math.min(366, Math.round(days))) : 90
  try {
    const result = await syncAnalyticsFor(data.user.id, { days: span, manual: true })
    revalidatePath("/dashboard/analytics")
    switch (result.status) {
      case "ok":
        return { ok: true, message: result.posts === 1 ? "Synced 1 post." : `Synced ${result.posts} posts.` }
      case "throttled":
        return { ok: true, message: "Already up to date. You can sync again in a minute." }
      case "syncing":
        return { ok: true, message: "Zernio is still collecting your analytics. Check back in a few minutes." }
      case "addon_required":
        return { ok: false, error: "Views and engagement need Zernio's Analytics add-on." }
      case "not_connected":
        return { ok: false, error: "Connect an account on the Accounts page first." }
      default:
        return { ok: false, error: "Couldn't sync your analytics. Please try again." }
    }
  } catch (error) {
    if (error instanceof ZernioError && error.status === 429) return { ok: false, error: "Zernio's rate limit was reached. Try again in a minute." }
    console.error("Analytics sync failed", error)
    return { ok: false, error: "Couldn't sync your analytics. Please try again." }
  }
}
