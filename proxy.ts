import { NextResponse, type NextRequest } from "next/server"
import { updateSession } from "@insforge/sdk/ssr/middleware"

const PROTECTED_PREFIXES = ["/dashboard", "/create-campaign"]
const AUTH_PAGES = ["/sign-in", "/sign-up"]

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })

  const { accessToken } = await updateSession({
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  })

  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const isAuthPage = AUTH_PAGES.includes(pathname)

  if (isProtected && !accessToken) {
    return redirectWithCookies(request, response, "/sign-in")
  }
  if (isAuthPage && accessToken) {
    return redirectWithCookies(request, response, "/dashboard")
  }

  return response
}

// Carry any refreshed or cleared auth cookies over to the redirect
function redirectWithCookies(request: NextRequest, from: NextResponse, path: string) {
  const redirect = NextResponse.redirect(new URL(path, request.url))
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
