import { NextResponse } from "next/server"
import { isZernioPlatform, ZernioClient, ZernioError } from "@/lib/zernio/client"
import { appUrl, currentUser } from "@/lib/zernio/route-auth"
import { ensureZernioProfile } from "@/lib/zernio/store"

/*
 * GET /api/integrations/zernio/connect?platform=instagram: sends the browser to the platform to
 * approve the connection, through the user's own Zernio profile. Comes back to the callback.
 */
export async function GET(request: Request) {
  const platform = new URL(request.url).searchParams.get("platform") ?? ""
  const back = (query: string) => NextResponse.redirect(appUrl(request, `/dashboard/accounts?${query}`))
  if (!isZernioPlatform(platform)) return back("error=unsupported_platform")

  const user = await currentUser()
  if (!user) return NextResponse.redirect(appUrl(request, "/sign-in"))

  try {
    const profile = await ensureZernioProfile(user.id, user.email ?? user.id)
    const authUrl = await ZernioClient.app().connectUrl(platform, profile.profileId, appUrl(request, "/api/integrations/zernio/callback"))
    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error("Could not start the Zernio connection", error)
    const code = error instanceof ZernioError && error.code === "not_configured" ? "not_configured" : "connect_failed"
    return back(`error=${code}&platform=${platform}`)
  }
}

