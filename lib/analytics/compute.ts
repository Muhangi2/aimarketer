import { MINUTES_PER_AGENT_POST, MINUTES_PER_DELIVERY, type AnalyticsInput, type DateRange, type DeliveryRow, type MetricKey, type MetricRow } from "@/lib/analytics/types"

/*
 * Turns stored rows into the Analytics page's numbers. Pure and safe in the browser, so the page
 * buckets days in the viewer's own time zone, and the Analytics Agent's tools get the very same
 * figures. Nothing is ever filled in: a metric no post reported stays null.
 */

const DAY_MS = 86_400_000

// ---- Calendar days ("YYYY-MM-DD"), done in UTC so they never shift ----

const toUtc = (day: string) => Date.parse(`${day}T00:00:00Z`)
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => fromUtc(toUtc(day) + n * DAY_MS)
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / DAY_MS) + 1

/** The calendar day an instant falls on in a time zone. */
export function dayIn(iso: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}

export const todayIn = (timeZone: string) => dayIn(new Date().toISOString(), timeZone)

/** The same number of days right before the range, for "vs previous period". */
export function previousRange(range: DateRange): DateRange {
  const length = daysBetween(range.from, range.to)
  return { from: addDays(range.from, -length), to: addDays(range.from, -1) }
}

const within = (day: string, range: DateRange) => day >= range.from && day <= range.to

// ---- Metric helpers ----

const ENGAGEMENT_PARTS: MetricKey[] = ["likes", "comments", "shares", "saves"]

/** Likes + comments + shares + saves, from whichever the platform reported; null if none. */
export function engagementOf(row: Pick<MetricRow, "metrics">) {
  const parts = ENGAGEMENT_PARTS.map((k) => row.metrics[k]).filter((v): v is number => v !== null)
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null
}

/** Sum of the values that exist; null when no row reported this value at all. */
function sumKnown(values: (number | null)[]) {
  const known = values.filter((v): v is number => v !== null)
  return known.length ? known.reduce((a, b) => a + b, 0) : null
}

// ---- The report ----

export type TrendMetric = "views" | "engagement" | "likes" | "comments" | "shares"
export const TREND_METRICS: { key: TrendMetric; label: string }[] = [
  { key: "views", label: "Views" },
  { key: "engagement", label: "Engagement" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
]

export type Bucket = { key: string; start: string; end: string }
export type ActivityPoint = Bucket & { published: number; failed: number }
// null: posts went out in this bucket, but none of them reported this metric yet
export type TrendPoint = Bucket & { posts: number } & Record<TrendMetric, number | null>

export type PlatformSlice = {
  platform: string
  posts: number
  views: number | null
  engagement: number | null
}

export type TopPost = {
  id: string
  platform: string
  content: string
  url: string | null
  thumbnailUrl: string | null
  publishedAt: string | null
  accountUsername: string | null
  views: number | null
  engagement: number | null
  engagementRate: number | null
  pending: boolean
}

type Period = {
  published: number
  failed: number
  // Published post copies (one per platform), used for the success rate and time saved
  deliveries: number
  agentPosts: number
  views: number | null
  engagement: number | null
  metricPosts: number
  viewPosts: number
}

export type AnalyticsReport = {
  range: DateRange
  granularity: "day" | "week"
  current: Period & { successRate: number | null; timeSavedMinutes: number }
  previous: Period & { successRate: number | null; timeSavedMinutes: number }
  activity: ActivityPoint[]
  trend: TrendPoint[]
  platforms: PlatformSlice[]
  topPosts: TopPost[]
  // Posts whose metrics Zernio hasn't collected yet
  pendingPosts: number
}

function period(deliveries: DeliveryRow[], metrics: MetricRow[]): Period & { successRate: number | null; timeSavedMinutes: number } {
  const published = deliveries.filter((d) => d.status === "published")
  const failed = deliveries.length - published.length
  const posts = new Set(published.map((d) => d.postId))
  const agentPosts = new Set(published.filter((d) => d.source === "agent").map((d) => d.postId)).size
  const viewsKnown = metrics.filter((m) => m.metrics.views !== null)
  return {
    published: posts.size,
    failed,
    deliveries: published.length,
    agentPosts,
    views: sumKnown(metrics.map((m) => m.metrics.views)),
    engagement: sumKnown(metrics.map(engagementOf)),
    metricPosts: metrics.length,
    viewPosts: viewsKnown.length,
    successRate: deliveries.length ? (published.length / deliveries.length) * 100 : null,
    timeSavedMinutes: published.length * MINUTES_PER_DELIVERY + agentPosts * MINUTES_PER_AGENT_POST,
  }
}

// Monday of the day's week
function weekStart(day: string) {
  const weekday = (new Date(toUtc(day)).getUTCDay() + 6) % 7
  return addDays(day, -weekday)
}

function bucketsFor(range: DateRange, granularity: "day" | "week"): Bucket[] {
  const out: Bucket[] = []
  if (granularity === "day") {
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push({ key: d, start: d, end: d })
    return out
  }
  for (let start = weekStart(range.from); start <= range.to; start = addDays(start, 7)) {
    const end = addDays(start, 6)
    out.push({ key: start, start: start < range.from ? range.from : start, end: end > range.to ? range.to : end })
  }
  return out
}

/**
 * Everything the Analytics page shows for one range. `input` may hold rows from before the range
 * (the previous period is compared against); rows are placed by their day in `timeZone`.
 * Views and engagement are each post's latest lifetime totals, counted on the day it was published.
 */
export function buildAnalytics(input: AnalyticsInput, range: DateRange, timeZone: string, options: { topLimit?: number } = {}): AnalyticsReport {
  const prev = previousRange(range)
  const deliveryDay = (d: DeliveryRow) => dayIn(d.at, timeZone)
  const metricDay = (m: MetricRow) => (m.publishedAt ? dayIn(m.publishedAt, timeZone) : null)

  const inRange = <T,>(rows: T[], day: (r: T) => string | null, r: DateRange) => rows.filter((row) => {
    const d = day(row)
    return d !== null && within(d, r)
  })
  const deliveries = inRange(input.deliveries, deliveryDay, range)
  const metrics = inRange(input.metrics, metricDay, range)

  const granularity = daysBetween(range.from, range.to) > 92 ? "week" : "day"
  const buckets = bucketsFor(range, granularity)
  const keyOf = (day: string) => (granularity === "day" ? day : weekStart(day))

  const activity = new Map(buckets.map((b) => [b.key, { ...b, published: 0, failed: 0 }]))
  for (const d of deliveries) {
    const point = activity.get(keyOf(deliveryDay(d)))
    if (point) point[d.status === "published" ? "published" : "failed"]++
  }

  const byBucket = new Map<string, MetricRow[]>()
  for (const m of metrics) {
    const key = keyOf(metricDay(m)!)
    byBucket.set(key, [...(byBucket.get(key) ?? []), m])
  }
  const trend: TrendPoint[] = buckets.map((b) => {
    const rows = byBucket.get(b.key) ?? []
    // No posts that day: nothing to count, so 0 is the true value
    const sum = (values: (number | null)[]) => (rows.length ? sumKnown(values) : 0)
    return {
      ...b,
      posts: rows.length,
      views: sum(rows.map((r) => r.metrics.views)),
      engagement: sum(rows.map(engagementOf)),
      likes: sum(rows.map((r) => r.metrics.likes)),
      comments: sum(rows.map((r) => r.metrics.comments)),
      shares: sum(rows.map((r) => r.metrics.shares)),
    }
  })

  const platformRows = new Map<string, MetricRow[]>()
  for (const m of metrics) platformRows.set(m.platform, [...(platformRows.get(m.platform) ?? []), m])
  const platforms = [...platformRows.entries()]
    .map(([platform, rows]) => ({
      platform,
      posts: rows.length,
      views: sumKnown(rows.map((r) => r.metrics.views)),
      engagement: sumKnown(rows.map(engagementOf)),
    }))
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || b.posts - a.posts)

  const topPosts = metrics
    .map((m) => ({
      id: m.id,
      platform: m.platform,
      content: m.content,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl,
      publishedAt: m.publishedAt,
      accountUsername: m.accountUsername,
      views: m.metrics.views,
      engagement: engagementOf(m),
      engagementRate: m.engagementRate,
      pending: m.syncStatus === "pending",
    }))
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || (b.engagement ?? -1) - (a.engagement ?? -1))
    .slice(0, options.topLimit ?? 6)

  return {
    range,
    granularity,
    current: period(deliveries, metrics),
    previous: period(inRange(input.deliveries, deliveryDay, prev), inRange(input.metrics, metricDay, prev)),
    activity: [...activity.values()],
    trend,
    platforms,
    topPosts,
    pendingPosts: metrics.filter((m) => m.syncStatus === "pending").length,
  }
}
