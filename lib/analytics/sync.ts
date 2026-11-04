import "server-only"
import { getInsForgeAdmin } from "@/lib/insforge/admin"
import { platformReports, type MetricKey } from "@/lib/analytics/types"
import type { PublishResult } from "@/lib/posts/types"
import { ZernioError, type PostAnalytics } from "@/lib/zernio/client"
import { zernioFor } from "@/lib/zernio/store"

/*
 * Copies the user's post analytics from Zernio into post_metric. Runs from the Inngest job and
 * the Analytics page's Sync button, without RLS, so every query filters by user_id itself.
 */

type Row = Record<string, unknown>
const db = () => getInsForgeAdmin().database

// 20 pages of 50 posts: plenty for one range, and bounded
const MAX_PAGES = 20
const UPSERT_BATCH = 200
// The Sync button can't hammer Zernio
export const MIN_SYNC_INTERVAL_MS = 60_000

export type SyncResult =
  | { status: "ok"; posts: number }
  | { status: "syncing" | "addon_required" | "not_connected" | "throttled" }
  | { status: "error"; message: string }

async function saveState(userId: string, state: Row) {
  const { error } = await db()
    .from("analytics_sync")
    .upsert([{ user_id: userId, ...state }], { onConflict: "user_id" })
  if (error) console.error("Could not save the analytics sync state", error)
}

async function lastAttempt(userId: string) {
  const { data } = await db().from("analytics_sync").select("last_attempt_at, last_synced_at").eq("user_id", userId).maybeSingle()
  const row = (data ?? {}) as Row
  return { attemptAt: row.last_attempt_at ? Date.parse(String(row.last_attempt_at)) : 0, syncedAt: row.last_synced_at ? String(row.last_synced_at) : null }
}

/** Zernio post id -> the app post (and campaign) that published it. */
async function draftLinks(userId: string) {
  const { data, error } = await db()
    .from("content_draft")
    .select("id, campaign_id, publish_results")
    .eq("user_id", userId)
    .in("status", ["publishing", "published", "failed"])
    .order("updated_at", { ascending: false })
    .limit(2000)
  if (error) throw new Error(`Could not load posts to link analytics: ${error.message}`)
  const links = new Map<string, { draftId: string; campaignId: string }>()
  for (const r of (data ?? []) as Row[]) {
    for (const result of (Array.isArray(r.publish_results) ? r.publish_results : []) as PublishResult[]) {
      if (result.provider === "zernio" && result.submissionId) links.set(result.submissionId, { draftId: String(r.id), campaignId: String(r.campaign_id) })
    }
  }
  return links
}

const toDay = (d: Date) => d.toISOString().slice(0, 10)

function toRow(userId: string, p: PostAnalytics, links: Map<string, { draftId: string; campaignId: string }>, now: string): Row {
  const link = (p.zernioPostId && links.get(p.zernioPostId)) || links.get(p.postId) || null
  // A metric the platform doesn't report is null, not Zernio's placeholder 0
  const metric = (key: MetricKey) => (platformReports(p.platform, key) ? p.metrics[key] : null)
  return {
    user_id: userId,
    zernio_post_id: p.postId,
    platform: p.platform,
    account_id: p.accountId,
    account_username: p.accountUsername,
    platform_post_id: p.platformPostId,
    platform_post_url: p.platformPostUrl,
    source: link || !p.external ? "app" : "external",
    content: p.content.slice(0, 2000),
    thumbnail_url: p.thumbnailUrl,
    media_type: p.mediaType,
    published_at: p.publishedAt,
    content_draft_id: link?.draftId ?? null,
    campaign_id: link?.campaignId ?? null,
    impressions: metric("impressions"),
    reach: metric("reach"),
    views: metric("views"),
    likes: metric("likes"),
    comments: metric("comments"),
    shares: metric("shares"),
    saves: metric("saves"),
    clicks: metric("clicks"),
    engagement_rate: p.engagementRate,
    sync_status: p.syncStatus,
    metrics_updated_at: p.lastUpdated,
    synced_at: now,
  }
}

/**
 * Syncs the last `days` days (at most 366, Zernio's limit). With `manual`, a sync started less
 * than a minute ago is skipped. Never throws: the outcome is saved and returned.
 */
export async function syncAnalyticsFor(userId: string, options: { days?: number; manual?: boolean } = {}): Promise<SyncResult> {
  const previous = await lastAttempt(userId)
  if (options.manual && Date.now() - previous.attemptAt < MIN_SYNC_INTERVAL_MS) return { status: "throttled" }
  const startedAt = new Date().toISOString()

  const zernio = await zernioFor(userId).catch(() => null)
  if (!zernio) {
    await saveState(userId, { status: "not_connected", last_attempt_at: startedAt, last_error: null })
    return { status: "not_connected" }
  }
  await saveState(userId, { last_attempt_at: startedAt })

  // First sync: a full year. Afterwards the job refreshes recent posts, whose numbers still move
  const days = Math.min(366, options.days ?? (previous.syncedAt ? 90 : 365))
  const to = new Date()
  const from = new Date(to.getTime() - (days - 1) * 86_400_000)

  try {
    const posts: PostAnalytics[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await zernio.client.listPostAnalytics({ profileId: zernio.profile.profileId, fromDate: toDay(from), toDate: toDay(to), page })
      if (result.syncing) {
        await saveState(userId, { status: "syncing", last_error: null })
        return { status: "syncing" }
      }
      posts.push(...result.posts)
      if (!result.hasMore) break
    }

    const links = await draftLinks(userId)
    const rows = posts.map((p) => toRow(userId, p, links, startedAt))
    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const { error } = await db()
        .from("post_metric")
        .upsert(rows.slice(i, i + UPSERT_BATCH), { onConflict: "user_id,zernio_post_id,platform,account_id" })
      if (error) throw new Error(`Could not save post metrics: ${error.message}`)
    }
    await saveState(userId, { status: "ok", last_synced_at: startedAt, last_error: null, posts_synced: rows.length })
    return { status: "ok", posts: rows.length }
  } catch (error) {
    if (error instanceof ZernioError && (error.status === 402 || error.code === "analytics_addon_required")) {
      await saveState(userId, { status: "addon_required", last_error: null })
      return { status: "addon_required" }
    }
    // Rate limits are passed on so the background job can wait and retry
    if (error instanceof ZernioError && error.status === 429) throw error
    const message = error instanceof Error ? error.message : "Analytics sync failed."
    console.error("Analytics sync failed", error)
    await saveState(userId, { status: "error", last_error: message.slice(0, 500) })
    return { status: "error", message }
  }
}

/** Users with a Zernio profile, for the scheduled sync. */
export async function listZernioUsers(): Promise<string[]> {
  const { data, error } = await db().from("zernio_profile").select("user_id").limit(5000)
  if (error) throw new Error(`Could not list Zernio users: ${error.message}`)
  return ((data ?? []) as Row[]).map((r) => String(r.user_id))
}
