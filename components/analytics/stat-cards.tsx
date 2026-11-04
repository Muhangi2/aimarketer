import { ArrowDownRight, ArrowUpRight, CheckCircle2, Eye, Info, Send, Timer, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import type { AnalyticsReport } from "@/lib/analytics/compute"
import { TIME_SAVED_NOTE } from "@/lib/analytics/types"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatCompact, formatFull, formatHours } from "@/components/analytics/parts"

type Delta = { text: string; up: boolean } | null

/** Change vs the previous period. None when either side is unknown or there's nothing to compare. */
function percentDelta(current: number | null, previous: number | null): Delta {
  if (current === null || previous === null || previous === 0) return null
  const change = ((current - previous) / previous) * 100
  if (Math.abs(change) < 0.5) return { text: "0%", up: true }
  return { text: `${Math.abs(change) >= 100 ? Math.round(change) : change.toFixed(1)}%`.replace("-", ""), up: change > 0 }
}

function pointsDelta(current: number | null, previous: number | null): Delta {
  if (current === null || previous === null) return null
  const change = current - previous
  return { text: `${Math.abs(change).toFixed(1).replace(/\.0$/, "")} pts`, up: change >= 0 }
}

function StatCard({
  label,
  value,
  caption,
  delta,
  Icon,
  tone,
  info,
  footer,
  index,
}: {
  label: string
  value: string
  caption: string
  delta: Delta
  Icon: LucideIcon
  tone: string
  info?: string
  footer?: React.ReactNode
  index: number
}) {
  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-2xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md animate-in fade-in slide-in-from-bottom-2 duration-500"
      style={{ animationDelay: `${index * 60}ms`, animationFillMode: "both" }}
    >
      <div className="flex items-center gap-2">
        <span className={cn("flex size-9 items-center justify-center rounded-xl", tone)}>
          <Icon className="size-4" />
        </span>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {info && (
          <Tooltip>
            <TooltipTrigger render={<button type="button" aria-label={`How ${label.toLowerCase()} is calculated`} className="text-muted-foreground/70 hover:text-foreground" />}>
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">{info}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="mt-4 flex items-end gap-2">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
        {delta && (
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
              delta.up ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/12 text-rose-700 dark:text-rose-300"
            )}
            title="Compared with the previous period of the same length"
          >
            {delta.up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {delta.text}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{caption}</p>
      {footer}
    </div>
  )
}

export function StatCards({ report, hasMetrics }: { report: AnalyticsReport; hasMetrics: boolean }) {
  const { current: c, previous: p } = report
  const attempts = c.deliveries + c.failed

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        index={0}
        label="Posts published"
        value={formatFull(c.published)}
        caption={c.published ? `${c.deliveries} platform post${c.deliveries === 1 ? "" : "s"} went out` : "Nothing published in this period"}
        delta={percentDelta(c.published, p.published)}
        Icon={Send}
        tone="bg-brand/12 text-brand dark:text-brand-glow"
      />
      <StatCard
        index={1}
        label="Total views"
        value={formatCompact(c.views)}
        caption={
          !hasMetrics
            ? "No analytics synced yet"
            : c.metricPosts === 0
              ? "No post analytics in this period"
              : c.views === null
                ? "These platforms didn't report views"
                : `From ${c.viewPosts} of ${c.metricPosts} post${c.metricPosts === 1 ? "" : "s"} with analytics`
        }
        delta={percentDelta(c.views, p.views)}
        Icon={Eye}
        tone="bg-brand/12 text-brand dark:text-brand-glow"
        info="Each post's latest lifetime views, counted in the period it was published. Synced from your connected accounts."
      />
      <StatCard
        index={2}
        label="Publishing success"
        value={c.successRate === null ? "—" : `${c.successRate.toFixed(c.successRate % 1 === 0 ? 0 : 1)}%`}
        caption={attempts ? `${c.deliveries} of ${attempts} went out${c.failed ? ` · ${c.failed} failed` : ""}` : "No posts were due in this period"}
        delta={pointsDelta(c.successRate, p.successRate)}
        Icon={CheckCircle2}
        tone="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
        footer={
          c.successRate !== null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${c.successRate}%` }} />
            </div>
          )
        }
      />
      <StatCard
        index={3}
        label="Est. time saved"
        value={formatHours(c.timeSavedMinutes)}
        caption={c.published ? `${c.agentPosts} post${c.agentPosts === 1 ? "" : "s"} written by your agents` : "Grows as your posts go out"}
        delta={percentDelta(c.timeSavedMinutes, p.timeSavedMinutes)}
        Icon={Timer}
        tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
        info={`An estimate, not a measurement. ${TIME_SAVED_NOTE}`}
      />
    </div>
  )
}
