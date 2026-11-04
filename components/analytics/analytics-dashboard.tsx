"use client"

import { useMemo, useState, useSyncExternalStore, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { AlertTriangle, Clock, Link2, Loader2, RefreshCw, Sparkles } from "lucide-react"
import { cn } from "cn"
import { syncAnalyticsNow } from "@/app/actions/analytics"
import { addDays, buildAnalytics, daysBetween, todayIn } from "@/lib/analytics/compute"
import { RANGE_PRESETS, type AnalyticsInput, type DateRange, type SyncState } from "@/lib/analytics/types"
import { Button, buttonVariants } from "@/components/ui/button"
import { CampaignPicker, RangePicker, type CampaignOption, type RangeChoice } from "@/components/analytics/analytics-filters"
import { ActivityChart, PlatformDonut, TrendChart } from "@/components/analytics/charts"
import { formatSpan } from "@/components/analytics/parts"
import { StatCards } from "@/components/analytics/stat-cards"
import { TopPosts } from "@/components/analytics/top-posts"

export type { RangeChoice }

// Days are bucketed in the viewer's own time zone; the server render uses UTC until hydration
const subscribe = () => () => {}
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
const serverZone = () => "UTC"

function resolveRange(range: RangeChoice, today: string): DateRange {
  if (range.kind === "custom") return { from: range.from, to: range.to }
  return { from: addDays(today, -(range.days - 1)), to: today }
}

function Notice({ tone, Icon, children, action }: { tone: "info" | "warn" | "error"; Icon: typeof AlertTriangle; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm animate-in fade-in duration-300",
        tone === "info" && "border-blue-500/20 bg-blue-500/6 text-blue-900 dark:text-blue-200",
        tone === "warn" && "border-amber-500/25 bg-amber-500/8 text-amber-900 dark:text-amber-200",
        tone === "error" && "border-destructive/25 bg-destructive/8 text-destructive"
      )}
    >
      <Icon className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">{children}</p>
      {action}
    </div>
  )
}

function SyncNotices({ sync, connected, configured, pendingPosts }: { sync: SyncState; connected: boolean; configured: boolean; pendingPosts: number }) {
  if (!configured) {
    return (
      <Notice tone="warn" Icon={AlertTriangle}>
        Account analytics aren&apos;t set up on this server yet. Post counts and success rate below come from your own posts.
      </Notice>
    )
  }
  if (!connected) {
    return (
      <Notice
        tone="info"
        Icon={Link2}
        action={
          <Link href="/dashboard/accounts" className={buttonVariants({ size: "sm" })}>
            Connect accounts
          </Link>
        }
      >
        Connect Instagram, TikTok or YouTube to see real views and engagement. Until then, only your publishing stats show.
      </Notice>
    )
  }
  if (sync.status === "addon_required") {
    return (
      <Notice tone="warn" Icon={Sparkles}>
        Views and engagement need Zernio&apos;s Analytics add-on. Post counts and success rate still work without it.
      </Notice>
    )
  }
  if (sync.status === "error") {
    return (
      <Notice tone="error" Icon={AlertTriangle}>
        The last sync didn&apos;t finish{sync.lastError ? `: ${sync.lastError}` : "."} The numbers below are from the last successful sync.
      </Notice>
    )
  }
  if (sync.status === "syncing") {
    return (
      <Notice tone="info" Icon={Loader2}>
        {sync.lastSyncedAt ? "Your accounts are still reporting some numbers." : "Syncing your analytics for the first time."} This can take a few minutes.
      </Notice>
    )
  }
  if (pendingPosts > 0) {
    return (
      <Notice tone="info" Icon={Clock}>
        {pendingPosts} recent post{pendingPosts === 1 ? " hasn't" : "s haven't"} reported metrics yet. Platforms report new posts within a day or two.
      </Notice>
    )
  }
  return null
}

function SyncButton({ sync, days, disabled }: { sync: SyncState; days: number; disabled: boolean }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  const run = () =>
    startTransition(async () => {
      const result = await syncAnalyticsNow(days)
      setMessage(result.ok ? { text: result.message, error: false } : { text: result.error, error: true })
      setTimeout(() => setMessage(null), 5000)
    })

  return (
    <div className="flex items-center gap-3">
      <span className={cn("hidden text-xs sm:block", message?.error ? "text-destructive" : "text-muted-foreground")} aria-live="polite">
        {message?.text ?? (sync.lastSyncedAt ? `Synced ${formatDistanceToNow(new Date(sync.lastSyncedAt), { addSuffix: true })}` : "Not synced yet")}
      </span>
      <Button variant="outline" size="sm" className="h-9 gap-2 rounded-xl bg-card shadow-xs" onClick={run} disabled={pending || disabled}>
        <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
        {pending ? "Syncing…" : "Sync now"}
      </Button>
    </div>
  )
}

export function AnalyticsDashboard({
  input,
  range,
  campaigns,
  campaignId,
  sync,
  connected,
  configured,
}: {
  input: AnalyticsInput
  range: RangeChoice
  campaigns: CampaignOption[]
  campaignId: string | null
  sync: SyncState
  connected: boolean
  configured: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [navigating, startTransition] = useTransition()
  const timeZone = useSyncExternalStore(subscribe, browserZone, serverZone)
  const today = todayIn(timeZone)
  const dates = resolveRange(range, today)
  const report = useMemo(() => buildAnalytics(input, dates, timeZone), [input, dates.from, dates.to, timeZone]) // eslint-disable-line react-hooks/exhaustive-deps
  // Any synced metrics at all, in or out of this range: tells "nothing yet" from "nothing in this period"
  const hasMetrics = input.metrics.length > 0 || sync.lastSyncedAt !== null

  const navigate = (next: { range?: RangeChoice; campaign?: string | null }) => {
    const r = next.range ?? range
    const c = next.campaign === undefined ? campaignId : next.campaign
    const params = new URLSearchParams()
    if (r.kind === "custom") {
      params.set("from", r.from)
      params.set("to", r.to)
    } else if (r.key !== "30d") params.set("range", r.key)
    params.set("campaign", c ?? "all")
    startTransition(() => router.push(`${pathname}?${params}`, { scroll: false }))
  }

  const rangeLabel = range.kind === "preset" ? RANGE_PRESETS.find((p) => p.key === range.key)!.label : formatSpan(range.from, range.to)

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end gap-4 animate-in fade-in duration-300">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
          <p className="mt-1 text-sm text-muted-foreground">How your posts are performing across your connected accounts.</p>
        </div>
        <SyncButton sync={sync} days={daysBetween(dates.from, dates.to)} disabled={!connected || !configured} />
      </div>

      {/* Filters: one row, above everything they scope */}
      <div className="flex flex-wrap items-center gap-2">
        <RangePicker range={range} label={rangeLabel} today={today} onChange={(r) => navigate({ range: r })} />
        <CampaignPicker campaigns={campaigns} value={campaignId} onChange={(id) => navigate({ campaign: id })} />
        <span className="ml-1 flex items-center gap-2 text-xs text-muted-foreground">
          {navigating && <Loader2 className="size-3.5 animate-spin" />}
          {formatSpan(dates.from, dates.to)}
          {" · "}vs {formatSpan(addDays(dates.from, -daysBetween(dates.from, dates.to)), addDays(dates.from, -1))}
        </span>
      </div>

      <SyncNotices sync={sync} connected={connected} configured={configured} pendingPosts={report.pendingPosts} />

      {/* While new data loads, the old render stays in place, dimmed */}
      <div className={cn("flex flex-col gap-6 transition-opacity duration-200", navigating && "pointer-events-none opacity-60")}>
        <StatCards report={report} hasMetrics={hasMetrics} />
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="flex min-w-0 flex-col *:flex-1 lg:col-span-3">
            <TrendChart report={report} hasMetrics={hasMetrics} />
          </div>
          <div className="flex min-w-0 flex-col *:flex-1 lg:col-span-2">
            <PlatformDonut report={report} hasMetrics={hasMetrics} />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="flex min-w-0 flex-col *:flex-1 lg:col-span-3">
            <ActivityChart report={report} />
          </div>
          <div className="flex min-w-0 flex-col *:flex-1 lg:col-span-2">
            <TopPosts report={report} hasMetrics={hasMetrics} />
          </div>
        </div>
      </div>
    </div>
  )
}
