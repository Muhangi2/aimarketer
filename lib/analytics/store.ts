import "server-only"
import type { createServerClient } from "@insforge/sdk/ssr"
import { METRIC_KEYS, type AnalyticsInput, type DeliveryRow, type MetricRow, type Metrics, type SyncState } from "@/lib/analytics/types"
import type { PublishResult } from "@/lib/posts/types"

/*
 * Reads analytics rows for one user. Works with the signed-in client (RLS) and the admin client
 * (agent tools, background jobs): every query filters by user_id itself either way.
 */

export type DatabaseClient = { database: ReturnType<typeof createServerClient>["database"] }
type Row = Record<string, unknown>

// Enough rows for a year of busy posting; the page and tools only ever look at one range
const MAX_ROWS = 3000
const DAY_MS = 86_400_000

const METRIC_COLUMNS =
  "id, platform, account_username, platform_post_url, source, content, thumbnail_url, published_at, campaign_id, content_draft_id, impressions, reach, views, likes, comments, shares, saves, clicks, engagement_rate, sync_status"

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null)

function toMetricRow(r: Row): MetricRow {
  return {
    id: String(r.id),
    platform: String(r.platform),
    accountUsername: r.account_username ? String(r.account_username) : null,
    url: r.platform_post_url ? String(r.platform_post_url) : null,
    source: r.source === "app" ? "app" : "external",
    content: String(r.content ?? ""),
    thumbnailUrl: r.thumbnail_url ? String(r.thumbnail_url) : null,
    publishedAt: iso(r.published_at),
    campaignId: r.campaign_id ? String(r.campaign_id) : null,
    draftId: r.content_draft_id ? String(r.content_draft_id) : null,
    metrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, num(r[k])])) as Metrics,
    engagementRate: num(r.engagement_rate),
    syncStatus: String(r.sync_status ?? "synced"),
  }
}

/** Every platform copy of a post the app tried to publish, as published or failed. */
function toDeliveries(r: Row): DeliveryRow[] {
  const status = String(r.status)
  if (status !== "published" && status !== "failed") return []
  const at = iso(r.published_at) ?? iso(r.updated_at)!
  const base = { postId: String(r.id), campaignId: String(r.campaign_id), title: String(r.title ?? ""), source: r.source === "manual" ? ("manual" as const) : ("agent" as const), at }
  const results = Array.isArray(r.publish_results) ? (r.publish_results as PublishResult[]) : []
  const settled = results.filter((x) => x.status === "published" || x.status === "failed")
  if (settled.length > 0) return settled.map((x) => ({ ...base, platform: x.platform, status: x.status as "published" | "failed" }))
  // Failed before any platform got it (or an older row without results): count each platform once
  const platforms = Array.isArray(r.platforms) && r.platforms.length ? (r.platforms as string[]) : [String(r.platform ?? "unknown")]
  return platforms.map((platform) => ({ ...base, platform, status: status as "published" | "failed" }))
}

/**
 * Rows for one campaign (or all of the user's campaigns, plus posts made outside the app, when
 * campaignId is null) between two instants. Callers pad the window by a day for time zones.
 */
export async function loadAnalyticsInput(client: DatabaseClient, userId: string, scope: { campaignId: string | null; from: Date; to: Date }): Promise<AnalyticsInput> {
  const from = new Date(scope.from.getTime() - DAY_MS).toISOString()
  const to = new Date(scope.to.getTime() + DAY_MS).toISOString()

  let posts = client.database
    .from("content_draft")
    .select("id, campaign_id, title, source, platform, platforms, status, publish_results, published_at, updated_at")
    .eq("user_id", userId)
    .in("status", ["published", "failed"])
    .gte("updated_at", from)
  if (scope.campaignId) posts = posts.eq("campaign_id", scope.campaignId)

  let metrics = client.database
    .from("post_metric")
    .select(METRIC_COLUMNS)
    .eq("user_id", userId)
    .gte("published_at", from)
    .lte("published_at", to)
  if (scope.campaignId) metrics = metrics.eq("campaign_id", scope.campaignId)

  const [postsResult, metricsResult] = await Promise.all([
    posts.order("updated_at", { ascending: false }).limit(MAX_ROWS),
    metrics.order("published_at", { ascending: false }).limit(MAX_ROWS),
  ])
  if (postsResult.error) console.error("Could not load published posts for analytics", postsResult.error)
  if (metricsResult.error) console.error("Could not load post metrics", metricsResult.error)

  return {
    deliveries: ((postsResult.data ?? []) as Row[]).flatMap(toDeliveries).filter((d) => d.at >= from && d.at <= to),
    metrics: ((metricsResult.data ?? []) as Row[]).map(toMetricRow),
  }
}

/** How the user's last analytics sync went. */
export async function getSyncState(client: DatabaseClient, userId: string): Promise<SyncState> {
  const { data, error } = await client.database.from("analytics_sync").select("status, last_synced_at, last_error").eq("user_id", userId).maybeSingle()
  if (error) console.error("Could not load the analytics sync state", error)
  if (!data) return { status: "never", lastSyncedAt: null, lastError: null }
  const row = data as Row
  return { status: row.status as SyncState["status"], lastSyncedAt: iso(row.last_synced_at), lastError: row.last_error ? String(row.last_error) : null }
}
