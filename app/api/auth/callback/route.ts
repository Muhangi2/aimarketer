import { NextResponse, type NextRequest } from "next/server"
import { createAuthActions } from "@insforge/sdk/ssr"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("insforge_code")
  const oauthError = request.nextUrl.searchParams.get("error")

  if (oauthError || !code) {
    return NextResponse.redirect(new URL("/sign-in?error=oauth_failed", request.url))
  }

  const codeVerifier = request.cookies.get("insforge_code_verifier")?.value
  if (!codeVerifier) {
    return NextResponse.redirect(new URL("/sign-in?error=missing_verifier", request.url))
  }

  const response = NextResponse.redirect(new URL("/dashboard", request.url))
  const auth = createAuthActions({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  })

  const { data, error } = await auth.exchangeOAuthCode(code, codeVerifier)
  if (error || !data?.user) {
    console.error("OAuth code exchange failed", error)
    return NextResponse.redirect(new URL("/sign-in?error=exchange_failed", request.url))
  }

  response.cookies.delete("insforge_code_verifier")
  return response
}
