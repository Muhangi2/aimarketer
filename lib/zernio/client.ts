import "server-only"
import type { SocialAccount } from "@/lib/integrations/types"

/*
 * Zernio REST API (https://docs.zernio.com). The app's own key (ZERNIO_API_KEY) only creates
 * profiles and their scoped keys; everything done for a user goes through a key limited to that
 * user's profile, so Zernio itself keeps users apart.
 */

const BASE_URL = "https://zernio.com/api/v1"
const TIMEOUT_MS = 30_000

export const ZERNIO_PLATFORMS = ["instagram", "tiktok", "youtube"] as const
export type ZernioPlatform = (typeof ZERNIO_PLATFORMS)[number]
export const isZernioPlatform = (value: string): value is ZernioPlatform => (ZERNIO_PLATFORMS as readonly string[]).includes(value)

export class ZernioError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    // Seconds Zernio asked us to wait (429)
    readonly retryAfter: number | null = null
  ) {
    super(message)
    this.name = "ZernioError"
  }

  get isAuthError() {
    return this.status === 401
  }
}

export function zernioConfigured() {
  return Boolean(process.env.ZERNIO_API_KEY)
}

type Row = Record<string, unknown>
const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v))
const strOrNull = (v: unknown) => (typeof v === "string" && v ? v : null)

// ---- Shapes the app uses ----

export type ZernioPostInput = {
  accountId: string
  platform: ZernioPlatform
  content: string
  mediaItems: { url: string; type: "image" | "video" }[]
  platformSpecificData: Row
  // When to publish; a time in the past publishes right away
  scheduledFor: string
  idempotencyKey: string
}

const postBody = (input: Omit<ZernioPostInput, "idempotencyKey">) => ({
  content: input.content,
  mediaItems: input.mediaItems,
  platforms: [{ platform: input.platform, accountId: input.accountId, platformSpecificData: input.platformSpecificData }],
  scheduledFor: input.scheduledFor,
})

export type ZernioPlatformStatus = {
  status: "in-progress" | "published" | "failed"
  publicUrl: string | null
  errorMessage: string | null
}

export type CommentedPost = {
  id: string
  platform: string
  accountId: string
  accountUsername: string
  content: string
  picture: string | null
  permalink: string | null
  createdTime: string
  commentCount: number
}

export type InboxComment = {
  id: string
  message: string
  createdTime: string
  from: { name: string; username: string; picture: string | null; isOwner: boolean }
  likeCount: number
  url: string | null
  canReply: boolean
  canDelete: boolean
  canHide: boolean
  isHidden: boolean
  replies: InboxComment[]
}

export type Conversation = {
  id: string
  platform: string
  accountId: string
  accountUsername: string
  participantName: string
  participantPicture: string | null
  lastMessage: string
  updatedTime: string
  unreadCount: number
  url: string | null
}

export type InboxMessage = {
  id: string
  text: string
  direction: "incoming" | "outgoing"
  senderName: string | null
  createdAt: string
  attachments: { type: string; url: string }[]
}

export type Page<T> = { items: T[]; nextCursor: string | null }

export const POST_METRIC_KEYS = ["impressions", "reach", "views", "likes", "comments", "shares", "saves", "clicks"] as const
export type PostMetricKey = (typeof POST_METRIC_KEYS)[number]

// One platform's copy of a post, with its metrics. A metric Zernio didn't send is null
export type PostAnalytics = {
  postId: string
  // The Zernio post id when the post was sent through Zernio (matches PublishResult.submissionId)
  zernioPostId: string | null
  platform: string
  accountId: string
  accountUsername: string | null
  platformPostId: string | null
  platformPostUrl: string | null
  external: boolean
  content: string
  thumbnailUrl: string | null
  mediaType: string | null
  publishedAt: string | null
  metrics: Record<PostMetricKey, number | null>
  engagementRate: number | null
  syncStatus: string
  lastUpdated: string | null
}

export type PostAnalyticsPage = { posts: PostAnalytics[]; hasMore: boolean; syncing: boolean; hasAnalyticsAccess: boolean }

const metricValue = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : Number.NaN
  return Number.isFinite(n) ? n : null
}

function toMetrics(analytics: unknown): { metrics: Record<PostMetricKey, number | null>; engagementRate: number | null; lastUpdated: string | null } {
  const a = (analytics && typeof analytics === "object" ? analytics : {}) as Row
  return {
    metrics: Object.fromEntries(POST_METRIC_KEYS.map((k) => [k, metricValue(a[k])])) as Record<PostMetricKey, number | null>,
    engagementRate: metricValue(a.engagementRate),
    lastUpdated: strOrNull(a.lastUpdated),
  }
}

/*
 * A post from the analytics list, split into one entry per platform account. The list's post
 * shape isn't fully documented, so this reads the single-post fields (postId, latePostId,
 * platformAnalytics[]) and falls back to flat platform/analytics fields.
 */
function toPostAnalytics(p: Row): PostAnalytics[] {
  const postId = str(p.postId ?? p._id ?? p.id)
  if (!postId) return []
  const zernioPostId = strOrNull(p.latePostId) ?? (p.isExternal === true || p.source === "external" ? null : postId)
  const thumbnail = strOrNull(p.thumbnailUrl) ?? strOrNull(((Array.isArray(p.mediaItems) ? p.mediaItems[0] : null) as Row | null)?.url)
  const base = {
    postId,
    zernioPostId,
    content: str(p.content),
    thumbnailUrl: thumbnail,
    mediaType: strOrNull(p.mediaType),
    publishedAt: strOrNull(p.publishedAt) ?? strOrNull(p.scheduledFor),
  }
  const entries = Array.isArray(p.platformAnalytics) && p.platformAnalytics.length > 0 ? (p.platformAnalytics as Row[]) : [p]
  return entries
    .filter((e) => e.status !== "failed" && str(e.platform))
    .map((e) => ({
      ...base,
      platform: str(e.platform).toLowerCase(),
      accountId: str(e.accountId),
      accountUsername: strOrNull(e.accountUsername),
      platformPostId: strOrNull(e.platformPostId),
      platformPostUrl: strOrNull(e.platformPostUrl),
      external: e.isExternal === true || p.isExternal === true || (zernioPostId === null && p.source !== "late"),
      syncStatus: str(e.syncStatus) || "synced",
      ...toMetrics(e.analytics ?? p.analytics),
    }))
}

function toComment(c: Row): InboxComment {
  const from = (c.from ?? {}) as Row
  return {
    id: str(c.id),
    message: str(c.message),
    createdTime: str(c.createdTime),
    from: { name: str(from.name), username: str(from.username), picture: strOrNull(from.picture), isOwner: from.isOwner === true },
    likeCount: Number(c.likeCount ?? 0),
    url: strOrNull(c.url),
    canReply: c.canReply !== false,
    canDelete: c.canDelete === true,
    canHide: c.canHide === true,
    isHidden: c.isHidden === true,
    replies: Array.isArray(c.replies) ? (c.replies as Row[]).map(toComment) : [],
  }
}

export class ZernioClient {
  constructor(private readonly apiKey: string) {}

  /** The app's own key: only for creating profiles and their scoped keys. */
  static app() {
    const key = process.env.ZERNIO_API_KEY
    if (!key) throw new ZernioError("Zernio isn't set up on this server (ZERNIO_API_KEY is missing).", 503, "not_configured")
    return new ZernioClient(key)
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined>; idempotencyKey?: string } = {}): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`)
    for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v))
    let res: Response
    try {
      res = await fetch(url, {
        method: init.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      })
    } catch (error) {
      throw new ZernioError(`Couldn't reach Zernio (${error instanceof Error ? error.message : "network error"}).`, 0)
    }
    const body = (await res.json().catch(() => null)) as Row | null
    // 207: published on some platforms only; the body describes each one
    if (!res.ok && res.status !== 207) {
      const message = typeof body?.error === "string" ? body.error : `Zernio returned an error (${res.status}).`
      const code = typeof body?.code === "string" ? body.code : null
      const details = (body?.details ?? {}) as Row
      const retryAfter = Number(res.headers.get("retry-after") ?? details.retryAfterSeconds)
      if (res.status === 401) throw new ZernioError("Zernio rejected the API key.", 401, code)
      if (res.status === 402) throw new ZernioError("The Zernio plan needs a payment method for more accounts or messages.", 402, code)
      throw new ZernioError(`Zernio: ${message}`, res.status, code, Number.isFinite(retryAfter) ? retryAfter : null)
    }
    return (body ?? {}) as T
  }

  // ---- Profiles and keys (app key) ----

  /** The profile for one of our users, created on first use. externalId is our user id. */
  async ensureProfile(userId: string, name: string): Promise<string> {
    const found = await this.request<{ profiles?: Row[] }>("/profiles", { query: { externalId: userId } })
    const existing = found.profiles?.[0]
    if (existing?._id) return str(existing._id)
    try {
      const created = await this.request<{ profile?: Row }>("/profiles", { method: "POST", body: { name: name.slice(0, 80), externalId: userId }, idempotencyKey: `profile-${userId}` })
      if (created.profile?._id) return str(created.profile._id)
    } catch (error) {
      // Created by a parallel request in the meantime
      const existingId = error instanceof ZernioError && error.status === 409 ? await this.request<{ profiles?: Row[] }>("/profiles", { query: { externalId: userId } }) : null
      if (existingId?.profiles?.[0]?._id) return str(existingId.profiles[0]._id)
      throw error
    }
    throw new ZernioError("Zernio didn't return a profile id.", 502)
  }

  /** A key that only works on one profile. "read" keys can only make GET requests. */
  async createProfileKey(profileId: string, permission: "read" | "read-write", name: string): Promise<{ id: string; key: string }> {
    const body = await this.request<{ apiKey?: Row }>("/api-keys", {
      method: "POST",
      body: { name, scope: "profiles", profileIds: [profileId], permission },
    })
    if (!body.apiKey?.key || !body.apiKey.id) throw new ZernioError("Zernio didn't return the new key.", 502)
    return { id: str(body.apiKey.id), key: str(body.apiKey.key) }
  }

  async deleteKey(keyId: string) {
    await this.request(`/api-keys/${encodeURIComponent(keyId)}`, { method: "DELETE" })
  }

  // ---- Accounts ----

  /** The link that takes the user to the platform to approve the connection. */
  async connectUrl(platform: ZernioPlatform, profileId: string, redirectUrl: string): Promise<string> {
    const body = await this.request<{ authUrl?: string }>(`/connect/${platform}`, { query: { profileId, redirect_url: redirectUrl } })
    if (!body.authUrl) throw new ZernioError("Zernio didn't return a connect link.", 502)
    return body.authUrl
  }

  async listAccounts(profileId: string): Promise<SocialAccount[]> {
    const body = await this.request<{ accounts?: Row[] }>("/accounts", { query: { profileId, category: "social" } })
    return (body.accounts ?? [])
      .filter((a) => a._id && typeof a.platform === "string" && a.isActive !== false)
      .map((a) => ({
        id: str(a._id),
        platform: str(a.platform),
        fullname: str(a.displayName),
        username: str(a.username).replace(/^@/, ""),
        picture: strOrNull(a.profilePicture),
        needsReconnection: a.needsReconnection === true,
      }))
  }

  async disconnectAccount(accountId: string) {
    await this.request(`/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" })
  }

  // ---- Posts ----

  async createPost(input: ZernioPostInput): Promise<{ postId: string }> {
    const body = await this.request<{ post?: Row }>("/posts", { method: "POST", idempotencyKey: input.idempotencyKey, body: postBody(input) })
    if (!body.post?._id) throw new ZernioError("Zernio didn't return a post id.", 502)
    return { postId: str(body.post._id) }
  }

  /** Changes a post Zernio hasn't published yet (text, media, account or time). */
  async updatePost(postId: string, input: Omit<ZernioPostInput, "idempotencyKey">) {
    await this.request(`/posts/${encodeURIComponent(postId)}`, { method: "PUT", body: postBody(input) })
  }

  /** Cancels a post Zernio hasn't published yet. Already gone is fine. */
  async deletePost(postId: string) {
    try {
      await this.request(`/posts/${encodeURIComponent(postId)}`, { method: "DELETE" })
    } catch (error) {
      if (error instanceof ZernioError && error.status === 404) return
      throw error
    }
  }

  async getPostStatus(postId: string): Promise<ZernioPlatformStatus> {
    const body = await this.request<{ post?: Row }>(`/posts/${encodeURIComponent(postId)}`)
    const post = body.post ?? {}
    const target = (Array.isArray(post.platforms) ? (post.platforms as Row[]) : [])[0] ?? {}
    const status = str(target.status || post.status)
    if (status === "published") return { status: "published", publicUrl: strOrNull(target.platformPostUrl), errorMessage: null }
    if (["failed", "cancelled"].includes(status)) {
      return { status: "failed", publicUrl: null, errorMessage: strOrNull(target.errorMessage) ?? "Zernio couldn't publish it." }
    }
    return { status: "in-progress", publicUrl: null, errorMessage: null }
  }

  // ---- Analytics ----

  /**
   * One page of post analytics for the profile (GET /v1/analytics), both posts sent through Zernio
   * and posts made on the platform directly. Throws ZernioError 402 without the analytics add-on.
   * `syncing` is true while Zernio is still collecting (202); the page then has no posts.
   */
  async listPostAnalytics(query: { profileId: string; fromDate: string; toDate: string; page: number; limit?: number }): Promise<PostAnalyticsPage> {
    const limit = query.limit ?? 50
    const body = await this.request<Row>("/analytics", {
      query: { profileId: query.profileId, fromDate: query.fromDate, toDate: query.toDate, page: query.page, limit, source: "all", sortBy: "date", order: "desc" },
    })
    if (str(body.syncStatus) === "pending") return { posts: [], hasMore: false, syncing: true, hasAnalyticsAccess: true }
    const posts = (Array.isArray(body.posts) ? (body.posts as Row[]) : []).flatMap(toPostAnalytics)
    const pagination = (body.pagination ?? {}) as Row
    const page = Number(pagination.page ?? query.page)
    const pages = Number(pagination.totalPages ?? pagination.pages)
    const hasMore =
      typeof pagination.hasMore === "boolean" ? pagination.hasMore : Number.isFinite(pages) ? page < pages : (Array.isArray(body.posts) ? body.posts.length : 0) >= limit
    return { posts, hasMore, syncing: false, hasAnalyticsAccess: body.hasAnalyticsAccess !== false }
  }

  // ---- Inbox: comments ----

  async listCommentedPosts(profileId: string, cursor?: string): Promise<Page<CommentedPost>> {
    const body = await this.request<{ data?: Row[]; pagination?: Row }>("/inbox/comments", { query: { profileId, limit: 30, cursor, sortBy: "date", sortOrder: "desc" } })
    return {
      items: (body.data ?? [])
        .filter((p) => p.isAd !== true)
        .map((p) => ({
          id: str(p.id),
          platform: str(p.platform),
          accountId: str(p.accountId),
          accountUsername: str(p.accountUsername),
          content: str(p.content),
          picture: strOrNull(p.picture),
          permalink: strOrNull(p.permalink),
          createdTime: str(p.createdTime),
          commentCount: Number(p.commentCount ?? 0),
        })),
      nextCursor: strOrNull(body.pagination?.nextCursor),
    }
  }

  async listComments(postId: string, accountId: string, cursor?: string): Promise<Page<InboxComment>> {
    const body = await this.request<{ comments?: Row[]; pagination?: Row }>(`/inbox/comments/${encodeURIComponent(postId)}`, { query: { accountId, limit: 50, cursor } })
    return {
      items: (body.comments ?? []).map(toComment),
      nextCursor: body.pagination?.hasMore ? strOrNull(body.pagination.cursor) : null,
    }
  }

  /** Replies to the post, or to one comment on it when commentId is given. */
  async replyToComment(postId: string, accountId: string, message: string, commentId: string | null, idempotencyKey: string) {
    await this.request(`/inbox/comments/${encodeURIComponent(postId)}`, {
      method: "POST",
      idempotencyKey,
      body: { accountId, message, ...(commentId ? { commentId } : {}) },
    })
  }

  async setCommentHidden(postId: string, commentId: string, accountId: string, hidden: boolean) {
    const path = `/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/hide`
    await (hidden ? this.request(path, { method: "POST", body: { accountId } }) : this.request(path, { method: "DELETE", query: { accountId } }))
  }

  async deleteComment(postId: string, commentId: string, accountId: string) {
    await this.request(`/inbox/comments/${encodeURIComponent(postId)}`, { method: "DELETE", query: { accountId, commentId } })
  }

  // ---- Inbox: DMs ----

  async listConversations(profileId: string, cursor?: string): Promise<Page<Conversation>> {
    const body = await this.request<{ data?: Row[]; pagination?: Row }>("/inbox/conversations", { query: { profileId, limit: 40, cursor, status: "active", sortOrder: "desc" } })
    return {
      items: (body.data ?? []).map((c) => ({
        id: str(c.id),
        platform: str(c.platform),
        accountId: str(c.accountId),
        accountUsername: str(c.accountUsername),
        participantName: str(c.participantName) || "Unknown",
        participantPicture: strOrNull(c.participantPicture),
        lastMessage: str(c.lastMessage),
        updatedTime: str(c.updatedTime),
        unreadCount: Number(c.unreadCount ?? 0),
        url: strOrNull(c.url),
      })),
      nextCursor: strOrNull(body.pagination?.nextCursor),
    }
  }

  async listMessages(conversationId: string, accountId: string): Promise<InboxMessage[]> {
    const body = await this.request<{ messages?: Row[] }>(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
      query: { accountId, limit: 50, sortOrder: "asc" },
    })
    return (body.messages ?? []).map((m) => ({
      id: str(m.id),
      text: str(m.message),
      direction: m.direction === "outgoing" ? "outgoing" : "incoming",
      senderName: strOrNull(m.senderName),
      createdAt: str(m.createdAt),
      attachments: (Array.isArray(m.attachments) ? (m.attachments as Row[]) : []).filter((a) => a.url).map((a) => ({ type: str(a.type), url: str(a.url) })),
    }))
  }

  /**
   * Sends a DM reply. humanAgent marks a reply typed by a person, which Instagram accepts up to
   * 7 days after the person's last message (instead of 24 hours).
   */
  async sendMessage(conversationId: string, accountId: string, message: string, idempotencyKey: string, humanAgent: boolean) {
    await this.request(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST",
      idempotencyKey,
      body: { accountId, message, ...(humanAgent ? { messageTag: "HUMAN_AGENT", messagingType: "MESSAGE_TAG" } : {}) },
    })
  }

  async markRead(conversationId: string, accountId: string) {
    await this.request(`/inbox/conversations/${encodeURIComponent(conversationId)}/read`, { method: "POST", body: { accountId } })
  }
}
