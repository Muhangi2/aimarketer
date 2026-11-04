import "server-only"
import type { SocialAccount } from "@/lib/blotato/types"

/*
 * Blotato REST API (https://help.blotato.com/rest-api-reference). Each user brings their own
 * API key; it's only ever sent from the server, in the blotato-api-key header.
 */

const BASE_URL = "https://backend.blotato.com/v2"
const TIMEOUT_MS = 20_000

export class BlotatoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    // Seconds Blotato asked us to wait (429 only)
    readonly retryAfter: number | null = null
  ) {
    super(message)
    this.name = "BlotatoError"
  }

  // The key is wrong, revoked, or the plan doesn't include API access
  get isAuthError() {
    return this.status === 401 || this.status === 403
  }
}

export type BlotatoUser = { id: string; subscriptionStatus: string | null; subscriptionPlan: string | null }

// Request body for POST /v2/posts; target fields depend on the platform
export type BlotatoPostInput = {
  accountId: string
  platform: "instagram" | "tiktok" | "youtube"
  text: string
  mediaUrls: string[]
  target: Record<string, unknown>
  scheduledTime?: string
}

export type BlotatoPostStatus = {
  status: "in-progress" | "scheduled" | "published" | "failed"
  publicUrl: string | null
  errorMessage: string | null
}

function describe(status: number, body: Record<string, unknown> | null) {
  const message = typeof body?.message === "string" ? body.message : typeof body?.error === "string" ? body.error : null
  if (status === 401) return "Blotato didn't accept this API key. Check it and try again."
  if (status === 403) return "Your Blotato plan doesn't include API access. Generating a key on Blotato starts a paid plan."
  if (status === 429) return message ?? "Blotato's rate limit was reached. Try again in a minute."
  return message ? `Blotato: ${message}` : `Blotato returned an error (${status}).`
}

export class BlotatoClient {
  constructor(private readonly apiKey: string) {}

  private async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    let res: Response
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        method: init.method ?? "GET",
        headers: {
          "blotato-api-key": this.apiKey,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      })
    } catch (error) {
      throw new BlotatoError(`Couldn't reach Blotato (${error instanceof Error ? error.message : "network error"}).`, 0)
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!res.ok) {
      const wait = typeof body?.message === "string" ? Number(body.message.match(/retry in (\d+)/i)?.[1]) : NaN
      throw new BlotatoError(describe(res.status, body), res.status, Number.isFinite(wait) ? wait : null)
    }
    return (body ?? {}) as T
  }

  /** Checks the key: 401/403 when it's wrong or the plan has no API access. */
  async getUser(): Promise<BlotatoUser> {
    const body = await this.request<Record<string, unknown>>("/users/me")
    return {
      id: String(body.id ?? ""),
      subscriptionStatus: typeof body.subscriptionStatus === "string" ? body.subscriptionStatus : null,
      subscriptionPlan: typeof body.subscriptionPlan === "string" ? body.subscriptionPlan : null,
    }
  }

  /** Every social account the user connected on Blotato. */
  async listAccounts(): Promise<SocialAccount[]> {
    const body = await this.request<{ items?: Record<string, unknown>[] }>("/users/me/accounts")
    return (body.items ?? [])
      .filter((a) => a.id != null && typeof a.platform === "string")
      .map((a) => ({
        id: String(a.id),
        platform: String(a.platform).toLowerCase(),
        fullname: String(a.fullname ?? a.name ?? ""),
        username: String(a.username ?? ""),
      }))
  }

  /** Submits a post. Without scheduledTime Blotato publishes it right away. */
  async createPost(input: BlotatoPostInput): Promise<{ submissionId: string }> {
    const body = await this.request<{ postSubmissionId?: string }>("/posts", {
      method: "POST",
      body: {
        post: {
          accountId: input.accountId,
          content: { text: input.text, mediaUrls: input.mediaUrls, platform: input.platform },
          target: { targetType: input.platform, ...input.target },
        },
        ...(input.scheduledTime ? { scheduledTime: input.scheduledTime } : {}),
      },
    })
    if (!body.postSubmissionId) throw new BlotatoError("Blotato didn't return a post id.", 502)
    return { submissionId: body.postSubmissionId }
  }

  async getPostStatus(submissionId: string): Promise<BlotatoPostStatus> {
    const body = await this.request<Record<string, unknown>>(`/posts/${encodeURIComponent(submissionId)}`)
    const status = String(body.status ?? "in-progress")
    return {
      status: (["in-progress", "scheduled", "published", "failed"].includes(status) ? status : "in-progress") as BlotatoPostStatus["status"],
      publicUrl: typeof body.publicUrl === "string" ? body.publicUrl : null,
      errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : null,
    }
  }
}
