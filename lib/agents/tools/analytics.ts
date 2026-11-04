import "server-only"
import { z } from "zod"
import { lenientTool } from "@/lib/ai/lenient-tool"
import { addDays, buildAnalytics, todayIn, type AnalyticsReport, type TrendMetric } from "@/lib/analytics/compute"
import { getSyncState, loadAnalyticsInput, type DatabaseClient } from "@/lib/analytics/store"
import { syncAnalyticsFor } from "@/lib/analytics/sync"
import { platformLabel, TIME_SAVED_NOTE } from "@/lib/analytics/types"
import { getInsForgeAdmin } from "@/lib/insforge/admin"

/*
 * Analytics Agent tools: the user's real performance data, read from the database the Analytics
 * page uses (synced from Zernio) and computed by the same code, so the agent's numbers match the
 * page. Used in chat (lib/ai/chat.ts) and for tasks the Master Agent assigns (task-runner.ts).
 *
 *   get_performance_summary, get_platform_breakdown, get_top_posts, get_trend, sync_analytics
 *
 * Tools return short plain text: small models read it better than JSON.
 */

export type AnalyticsScope = { userId: string; campaignId: string; campaignName: string }

// Days are bucketed in UTC here; the page uses the viewer's own time zone
const TIME_ZONE = "UTC"

const db = () => getInsForgeAdmin() as unknown as DatabaseClient

const fmt = (n: number | null) => (n === null ? "not reported" : Math.round(n).toLocaleString("en-US"))
const pct = (n: number | null) => (n === null ? "n/a" : `${n.toFixed(1)}%`)

function change(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return ""
  const delta = ((current - previous) / previous) * 100
  return ` (${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% vs previous period)`
}

const daysSchema = z.number().int().min(1).max(365).catch(30).default(30).describe("How many days back to look: 7, 30, 90 or 365")
const campaignSchema = z.enum(["this", "all"]).catch("this").default("this").describe('"this": only this campaign\'s posts. "all": every post on the connected accounts')

async function report(scope: AnalyticsScope, days: number, campaign: "this" | "all", topLimit?: number): Promise<AnalyticsReport> {
  const to = todayIn(TIME_ZONE)
  const from = addDays(to, -(days - 1))
  // Twice the range, for the previous-period comparison
  const input = await loadAnalyticsInput(db(), scope.userId, {
    campaignId: campaign === "this" ? scope.campaignId : null,
    from: new Date(`${addDays(from, -days)}T00:00:00Z`),
    to: new Date(`${to}T23:59:59Z`),
  })
  return buildAnalytics(input, { from, to }, TIME_ZONE, { topLimit })
}

async function syncNote(userId: string) {
  const state = await getSyncState(db(), userId)
  switch (state.status) {
    case "not_connected":
    case "never":
      return "Note: no analytics are synced. The user has to connect Instagram, TikTok or YouTube on the Accounts page first."
    case "addon_required":
      return "Note: Zernio needs its Analytics add-on before views and engagement can sync. Post counts and success rate still work."
    case "syncing":
      return "Note: Zernio is still collecting analytics; numbers may be incomplete."
    case "error":
      return `Note: the last analytics sync failed (${state.lastError ?? "unknown error"}).`
    default:
      return state.lastSyncedAt ? `Metrics last synced ${state.lastSyncedAt.slice(0, 16).replace("T", " ")} UTC.` : ""
  }
}

const scopeLabel = (scope: AnalyticsScope, campaign: "this" | "all") => (campaign === "this" ? `campaign "${scope.campaignName}"` : "all connected accounts")

/** The headline numbers as text: also given to the agent up front, so it starts from real data. */
export async function performanceSummary(scope: AnalyticsScope, days = 30, campaign: "this" | "all" = "this") {
  const [r, note] = await Promise.all([report(scope, days, campaign), syncNote(scope.userId)])
  const c = r.current
  const p = r.previous
  const lines = [
    `Performance for ${scopeLabel(scope, campaign)}, ${r.range.from} to ${r.range.to} (${days} days):`,
    `- Posts published: ${c.published}${change(c.published, p.published)}`,
    `- Publishing success rate: ${pct(c.successRate)} (${c.deliveries} platform posts went out, ${c.failed} failed)`,
    `- Total views: ${fmt(c.views)}${change(c.views, p.views)}${c.metricPosts ? ` (from ${c.viewPosts} of ${c.metricPosts} posts that report views)` : ""}`,
    `- Total engagement (likes + comments + shares + saves): ${fmt(c.engagement)}${change(c.engagement, p.engagement)}`,
    `- Estimated time saved: ${(c.timeSavedMinutes / 60).toFixed(1)} hours. ${TIME_SAVED_NOTE}`,
  ]
  if (r.pendingPosts) lines.push(`- ${r.pendingPosts} posts have no metrics yet (the platform hasn't reported them).`)
  if (c.metricPosts === 0) lines.push("- No post analytics in this period, so views and engagement are unknown, not zero.")
  if (note) lines.push(note)
  return lines.join("\n")
}

export function analyticsTools(scope: AnalyticsScope) {
  const summary = lenientTool({
    name: "get_performance_summary",
    description: "Headline numbers for a period: posts published, publishing success rate, total views, total engagement and estimated time saved, compared with the previous period.",
    parameters: z.object({ days: daysSchema, campaign: campaignSchema }),
    execute: ({ days, campaign }) => performanceSummary(scope, days, campaign),
  })

  const platforms = lenientTool({
    name: "get_platform_breakdown",
    description: "Views, engagement and number of posts per platform (Instagram, TikTok, YouTube...) for a period.",
    parameters: z.object({ days: daysSchema, campaign: campaignSchema }),
    execute: async ({ days, campaign }) => {
      const r = await report(scope, days, campaign)
      if (r.platforms.length === 0) return `No post analytics for ${scopeLabel(scope, campaign)} in the last ${days} days.`
      return [
        `Per platform, last ${days} days (${scopeLabel(scope, campaign)}):`,
        ...r.platforms.map((p) => {
          const rate = p.views && p.engagement !== null ? ` · engagement per view ${((p.engagement / p.views) * 100).toFixed(1)}%` : ""
          return `- ${platformLabel(p.platform)}: ${p.posts} posts · views ${fmt(p.views)} · engagement ${fmt(p.engagement)}${rate}`
        }),
      ].join("\n")
    },
  })

  const topPosts = lenientTool({
    name: "get_top_posts",
    description: "The best performing posts in a period, with their views, engagement and link.",
    parameters: z.object({
      days: daysSchema,
      campaign: campaignSchema,
      sort_by: z.enum(["views", "engagement", "engagement_rate"]).catch("views").default("views"),
      limit: z.number().int().min(1).max(10).catch(5).default(5),
    }),
    execute: async ({ days, campaign, sort_by, limit }) => {
      const r = await report(scope, days, campaign, Number.MAX_SAFE_INTEGER)
      if (r.topPosts.length === 0) return `No post analytics for ${scopeLabel(scope, campaign)} in the last ${days} days.`
      const key = { views: "views", engagement: "engagement", engagement_rate: "engagementRate" } as const
      const sorted = [...r.topPosts].sort((a, b) => (b[key[sort_by]] ?? -1) - (a[key[sort_by]] ?? -1)).slice(0, limit)
      return [
        `Top posts by ${sort_by.replace("_", " ")}, last ${days} days:`,
        ...sorted.map(
          (p, i) =>
            `${i + 1}. ${platformLabel(p.platform)}, ${p.publishedAt?.slice(0, 10) ?? "unknown date"}: "${p.content.slice(0, 90).replace(/\s+/g, " ")}" · views ${fmt(p.views)} · engagement ${fmt(p.engagement)} · engagement rate ${pct(p.engagementRate)}${p.pending ? " · metrics pending" : ""}${p.url ? ` · ${p.url}` : ""}`
        ),
      ].join("\n")
    },
  })

  const trend = lenientTool({
    name: "get_trend",
    description: "How views, engagement, likes, comments or shares moved over a period, day by day (week by week past 92 days), counted on the day each post was published.",
    parameters: z.object({
      days: daysSchema,
      campaign: campaignSchema,
      metric: z.enum(["views", "engagement", "likes", "comments", "shares"]).catch("views").default("views"),
    }),
    execute: async ({ days, campaign, metric }) => {
      const r = await report(scope, days, campaign)
      const points = r.trend.filter((t) => t.posts > 0)
      if (points.length === 0) return `No posts with analytics for ${scopeLabel(scope, campaign)} in the last ${days} days.`
      const value = (t: (typeof points)[number]) => t[metric as TrendMetric]
      return [
        `${metric} by ${r.granularity} of publishing, last ${days} days (only ${r.granularity}s with posts):`,
        ...points.slice(-40).map((t) => `- ${t.start}${t.end !== t.start ? ` to ${t.end}` : ""}: ${fmt(value(t))} from ${t.posts} posts`),
      ].join("\n")
    },
  })

  const sync = lenientTool({
    name: "sync_analytics",
    description: "Fetch the latest numbers from the user's connected accounts (Zernio) into the database. Use when the data looks old or the user asks for fresh numbers.",
    parameters: z.object({}),
    execute: async () => {
      const result = await syncAnalyticsFor(scope.userId, { manual: true }).catch((error) => ({ status: "error" as const, message: String(error?.message ?? error) }))
      switch (result.status) {
        case "ok":
          return `Synced ${result.posts} posts. Call the other analytics tools for the fresh numbers.`
        case "throttled":
          return "Analytics were synced less than a minute ago; the data is already fresh."
        case "syncing":
          return "Zernio is still collecting analytics. Try again in a few minutes."
        case "addon_required":
          return "Zernio needs its Analytics add-on before views and engagement can sync."
        case "not_connected":
          return "No social accounts are connected. The user can connect them on the Accounts page."
        default:
          return `The sync failed: ${result.message}`
      }
    },
  })

  return [summary, platforms, topPosts, trend, sync]
}
