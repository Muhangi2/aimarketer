import "server-only"
import type { createServerClient } from "@insforge/sdk/ssr"
import { isVideoUrl } from "@/lib/posts/platforms"
import type { PostMedia, PostRecord, PostStatus, PublishResult } from "@/lib/posts/types"

type DatabaseClient = { database: ReturnType<typeof createServerClient>["database"] }
type Row = Record<string, unknown>

export const POST_COLUMNS =
  "id, source, platform, platforms, format, title, body, hashtags, image_urls, media, status, scheduled_at, timezone, target_accounts, publish_results, published_at, publish_error, created_at, updated_at"

/** Storage folder for a campaign's post images. */
export const postsFolder = (campaignId: string) => `/campaigns/${campaignId}/posts`

const strings = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])

export function toPost(r: Row): PostRecord {
  const imageUrls = strings(r.image_urls)
  const stored = Array.isArray(r.media) && r.media.length > 0 ? (r.media as Partial<PostMedia>[]) : imageUrls.map((url): Partial<PostMedia> => ({ url, origin: "agent" }))
  // Older rows have no kind: tell videos apart by their extension
  const media = stored.map(
    (m): PostMedia => ({
      url: String(m.url),
      kind: m.kind ?? (isVideoUrl(String(m.url)) ? "video" : "image"),
      originalUrl: m.originalUrl ?? null,
      edits: m.edits ?? [],
      origin: m.origin ?? "agent",
    })
  )
  const targets = r.target_accounts && typeof r.target_accounts === "object" && !Array.isArray(r.target_accounts) ? (r.target_accounts as Row) : {}
  const platforms = strings(r.platforms)
  return {
    id: String(r.id),
    source: r.source === "manual" ? "manual" : "agent",
    title: String(r.title),
    body: String(r.body ?? ""),
    hashtags: strings(r.hashtags),
    platforms: platforms.length ? platforms : [String(r.platform)],
    format: String(r.format ?? "post"),
    media,
    status: r.status as PostStatus,
    scheduledAt: r.scheduled_at ? new Date(String(r.scheduled_at)).toISOString() : null,
    timezone: r.timezone ? String(r.timezone) : null,
    targetAccounts: Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, String(v)])),
    publishResults: Array.isArray(r.publish_results) ? (r.publish_results as PublishResult[]) : [],
    publishedAt: r.published_at ? new Date(String(r.published_at)).toISOString() : null,
    publishError: r.publish_error ? String(r.publish_error) : null,
    createdAt: new Date(String(r.created_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at ?? r.created_at)).toISOString(),
  }
}

/** Every post in the campaign (manual and agent-made), newest first. RLS keeps it to the owner's. */
export async function listPosts(client: DatabaseClient, campaignId: string, limit = 200) {
  const { data, error } = await client.database
    .from("content_draft")
    .select(POST_COLUMNS)
    .eq("campaign_id", campaignId)
    .neq("format", "hashtags")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    console.error("Could not load posts", error)
    return []
  }
  return ((data ?? []) as Row[]).map(toPost)
}

/** One post in the campaign, or null. RLS keeps it to the owner's. */
export async function getPost(client: DatabaseClient, campaignId: string, postId: string) {
  const { data, error } = await client.database
    .from("content_draft")
    .select(POST_COLUMNS)
    .eq("campaign_id", campaignId)
    .eq("id", postId)
    .maybeSingle()
  if (error) {
    console.error("Could not load the post", error)
    return null
  }
  return data ? toPost(data as Row) : null
}

/** The next scheduled posts, soonest first. */
export async function listUpcomingPosts(client: DatabaseClient, campaignId: string, limit = 5) {
  const { data, error } = await client.database
    .from("content_draft")
    .select(POST_COLUMNS)
    .eq("campaign_id", campaignId)
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit)
  if (error) {
    console.error("Could not load upcoming posts", error)
    return []
  }
  return ((data ?? []) as Row[]).map(toPost)
}
