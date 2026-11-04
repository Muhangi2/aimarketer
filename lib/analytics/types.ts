import { platformLabel } from "@/lib/integrations/types"

/* Analytics shapes shared by the server, the Analytics page and the Analytics Agent's tools. */

export const METRIC_KEYS = ["impressions", "reach", "views", "likes", "comments", "shares", "saves", "clicks"] as const
export type MetricKey = (typeof METRIC_KEYS)[number]
export type Metrics = Record<MetricKey, number | null>

/*
 * What each platform reports through Zernio (docs.zernio.com/platforms/compare). Anything else is
 * stored as null, so a TikTok post shows "not reported" for reach instead of a fake 0.
 */
const SUPPORTED: Record<string, readonly MetricKey[]> = {
  instagram: ["impressions", "reach", "views", "likes", "comments", "shares", "saves"],
  tiktok: ["views", "likes", "comments", "shares"],
  youtube: ["views", "likes", "comments", "shares"],
}

export function platformReports(platform: string, metric: MetricKey) {
  const list = SUPPORTED[platform]
  // Platforms we have no matrix for: trust whatever Zernio sent
  return list ? list.includes(metric) : true
}

/** One platform's copy of a published post, with its latest metrics (a post_metric row). */
export type MetricRow = {
  id: string
  platform: string
  accountUsername: string | null
  url: string | null
  source: "app" | "external"
  content: string
  thumbnailUrl: string | null
  publishedAt: string | null
  campaignId: string | null
  draftId: string | null
  metrics: Metrics
  engagementRate: number | null
  syncStatus: string
}

/** One platform's copy of a post this app tried to publish (from content_draft.publish_results). */
export type DeliveryRow = {
  postId: string
  campaignId: string
  title: string
  platform: string
  status: "published" | "failed"
  // The agent wrote it, or the user did
  source: "agent" | "manual"
  at: string
}

export type SyncState = {
  status: "ok" | "syncing" | "addon_required" | "not_connected" | "error" | "never"
  lastSyncedAt: string | null
  lastError: string | null
}

export type AnalyticsInput = { deliveries: DeliveryRow[]; metrics: MetricRow[] }

// ---- Ranges ----

export const RANGE_PRESETS = [
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
  { key: "90d", label: "Last 90 days", days: 90 },
  { key: "365d", label: "Last 12 months", days: 365 },
] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]["key"]

// Zernio returns at most 366 days per request
export const MAX_RANGE_DAYS = 366

/** "YYYY-MM-DD" days, inclusive. */
export type DateRange = { from: string; to: string }

// ---- Platform colors: validated categorical slots, assigned per platform and never by rank ----

const PLATFORM_ORDER = ["instagram", "tiktok", "youtube", "facebook", "twitter", "linkedin"]
const SLOTS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)", "var(--viz-6)"]

export function platformColor(platform: string) {
  const i = PLATFORM_ORDER.indexOf(platform)
  return i >= 0 ? SLOTS[i] : "var(--viz-other)"
}

export { platformLabel }

// ---- Estimated time saved ----

/*
 * A stated estimate, not a measurement: posting one copy by hand (export, upload, caption,
 * schedule) takes about 10 minutes, and writing a post's copy about 20 more when the Creator
 * Agent wrote it.
 */
export const MINUTES_PER_DELIVERY = 10
export const MINUTES_PER_AGENT_POST = 20
export const TIME_SAVED_NOTE = `About ${MINUTES_PER_DELIVERY} min for each platform a post went out to, plus ${MINUTES_PER_AGENT_POST} min for each post the Creator Agent wrote.`
