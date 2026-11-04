import "server-only"
import { createInsForgeServerClient } from "@/lib/insforge/server"

/** The signed-in user for /api routes (which skip the proxy), or null. */
export async function currentUser() {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  return data?.user ?? null
}

/** Absolute URL in this app, for links Zernio sends the browser back to. */
export function appUrl(request: Request, path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || new URL(request.url).origin
  return `${base}${path}`
}
