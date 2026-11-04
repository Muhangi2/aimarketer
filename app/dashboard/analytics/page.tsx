import { getDashboardContext } from "@/lib/dashboard"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { inngest } from "@/lib/inngest/client"
import { getSyncState, loadAnalyticsInput } from "@/lib/analytics/store"
import { MAX_RANGE_DAYS, RANGE_PRESETS, type RangePreset } from "@/lib/analytics/types"
import { zernioConfigured } from "@/lib/zernio/client"
import { getZernioProfile } from "@/lib/zernio/store"
import { AnalyticsDashboard, type RangeChoice } from "@/components/analytics/analytics-dashboard"

const DAY_MS = 86_400_000
const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The range in the URL: a preset (?range=30d) or custom days (?from=2026-10-01&to=2026-10-31). */
function parseRange(params: { range?: string; from?: string; to?: string }): RangeChoice {
  if (params.from && params.to && DAY.test(params.from) && DAY.test(params.to) && params.from <= params.to) {
    const days = Math.round((Date.parse(params.to) - Date.parse(params.from)) / DAY_MS) + 1
    if (days <= MAX_RANGE_DAYS) return { kind: "custom", from: params.from, to: params.to }
  }
  const preset = RANGE_PRESETS.find((p) => p.key === params.range) ?? RANGE_PRESETS[1]
  return { kind: "preset", key: preset.key as RangePreset, days: preset.days }
}

/** The instants to load: the range and the period before it, with a day of slack for time zones. */
function loadWindow(range: RangeChoice) {
  if (range.kind === "custom") {
    const from = Date.parse(`${range.from}T00:00:00Z`)
    const to = Date.parse(`${range.to}T23:59:59Z`)
    return { from: new Date(from - (to - from) - DAY_MS), to: new Date(to + DAY_MS) }
  }
  const now = Date.now()
  return { from: new Date(now - 2 * range.days * DAY_MS - DAY_MS), to: new Date(now + DAY_MS) }
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; campaign?: string }> }) {
  const [{ user, campaigns, activeCampaign }, params, insforge] = await Promise.all([getDashboardContext(), searchParams, createInsForgeServerClient()])
  const range = parseRange(params)
  // "all": every campaign plus posts made outside the app; otherwise one campaign (the active one by default)
  const campaignId = params.campaign === "all" ? null : (campaigns.find((c) => c.id === params.campaign) ?? activeCampaign).id

  const [input, sync, zernio] = await Promise.all([
    loadAnalyticsInput(insforge, user.id, { campaignId, ...loadWindow(range) }),
    getSyncState(insforge, user.id),
    getZernioProfile(insforge),
  ])
  const connected = zernio !== null && zernio.accounts.length > 0

  // First visit with accounts connected: start the first sync in the background
  if (connected && sync.status === "never") {
    await inngest.send({ name: "analytics/sync", id: `analytics-first-${user.id}`, data: { userId: user.id } }).catch((error) => {
      console.error("Could not queue the first analytics sync", error)
    })
  }

  return (
    <AnalyticsDashboard
      key={`${campaignId ?? "all"}`}
      input={input}
      range={range}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, iconType: c.icon_type, icon: c.icon }))}
      campaignId={campaignId}
      sync={sync.status === "never" && connected ? { ...sync, status: "syncing" } : sync}
      connected={connected}
      configured={zernioConfigured()}
    />
  )
}
