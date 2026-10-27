import "server-only"
import { createAdminClient } from "@insforge/sdk"

let client: ReturnType<typeof createAdminClient> | undefined

/**
 * Full-access client for background jobs (Inngest), which run without a signed-in user.
 * Bypasses RLS, so every query must filter by user and campaign itself. Never import from client code.
 */
export function getInsForgeAdmin() {
  if (!client) {
    const baseUrl = process.env.NEXT_PUBLIC_INSFORGE_URL
    const apiKey = process.env.INSFORGE_API_KEY
    if (!baseUrl || !apiKey) throw new Error("NEXT_PUBLIC_INSFORGE_URL and INSFORGE_API_KEY must be set for background jobs")
    client = createAdminClient({ baseUrl, apiKey })
  }
  return client
}
