import { NextResponse } from "next/server"
import { appUrl, currentUser } from "@/lib/zernio/route-auth"
import { syncZernioAccounts } from "@/lib/zernio/store"

/*
 * Zernio sends the browser here after the platform's approval screen, with
 * connected=<platform> on success or error=<code> on failure. Refreshes the user's accounts and
 * goes back to the Accounts page.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const user = await currentUser()
  if (!user) return NextResponse.redirect(appUrl(request, "/sign-in"))

  const platform = params.get("platform") ?? params.get("connected") ?? ""
  const error = params.get("error")
  if (error) {
    const message = params.get("error_message")
    const query = new URLSearchParams({ error, platform, ...(message ? { message: message.slice(0, 300) } : {}) })
    return NextResponse.redirect(appUrl(request, `/dashboard/accounts?${query}`))
  }

  await syncZernioAccounts(user.id).catch((e) => console.error("Could not refresh Zernio accounts after connecting", e))
  return NextResponse.redirect(appUrl(request, `/dashboard/accounts?connected=${encodeURIComponent(platform)}`))
}
