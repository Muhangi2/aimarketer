import "server-only"
import type { SocialAccount } from "@/lib/integrations/types"

/*
 * Postiz Cloud public API (https://docs.postiz.com/public-api). Each user brings their own API key,
 * sent raw in the Authorization header (no "Bearer"), only ever from the server.
 */

const BASE_URL = "https://api.postiz.com/public/v1"
const TIMEOUT_MS = 20_000

export const POSTIZ_DASHBOARD_URL = "https://platform.postiz.com"
// API keys live under Settings in the Postiz app
export const POSTIZ_KEYS_URL = "https://platform.postiz.com/settings"

export class PostizError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "PostizError"
  }

  get isAuthError() {
    return this.status === 401 || this.status === 403
  }
}

// Postiz provider identifiers -> the platform names used across the app
const PLATFORM_ALIASES: Record<string, string> = {
  "instagram-standalone": "instagram",
  x: "twitter",
  "linkedin-page": "linkedin",
}

export const normalizePostizPlatform = (identifier: string) => PLATFORM_ALIASES[identifier] ?? identifier

export class PostizClient {
  constructor(private readonly apiKey: string) {}

  private async request<T>(path: string): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        headers: { Authorization: this.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      })
    } catch (error) {
      throw new PostizError(`Couldn't reach Postiz (${error instanceof Error ? error.message : "network error"}).`, 0)
    }
    const body = (await res.json().catch(() => null)) as unknown
    if (!res.ok) {
      const message = body && typeof body === "object" && "message" in body && typeof body.message === "string" ? body.message : null
      if (res.status === 401) throw new PostizError("Postiz didn't accept this API key. Check it and try again.", 401)
      if (res.status === 403) throw new PostizError("Your Postiz plan doesn't allow API access, or the trial has ended.", 403)
      if (res.status === 429) throw new PostizError("Postiz's rate limit was reached. Try again later.", 429)
      throw new PostizError(message ? `Postiz: ${message}` : `Postiz returned an error (${res.status}).`, res.status)
    }
    return body as T
  }

  /** Every channel the user connected on Postiz. Also checks the key (401 when it's wrong). */
  async listChannels(): Promise<SocialAccount[]> {
    const body = await this.request<Record<string, unknown>[] | { integrations?: Record<string, unknown>[] }>("/integrations")
    const items = Array.isArray(body) ? body : (body.integrations ?? [])
    return items
      .filter((c) => c.id != null && typeof c.identifier === "string" && c.disabled !== true)
      .map((c) => ({
        id: String(c.id),
        platform: normalizePostizPlatform(String(c.identifier)),
        fullname: String(c.name ?? ""),
        username: String(c.profile ?? ""),
      }))
  }
}
