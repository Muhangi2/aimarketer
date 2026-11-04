"use client"

import { useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import { BarChart3, LineChart, PieChart as PieIcon } from "lucide-react"
import { TREND_METRICS, type AnalyticsReport, type TrendMetric } from "@/lib/analytics/compute"
import { platformColor, platformLabel } from "@/lib/analytics/types"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { PlatformIcon } from "@/components/posts/platform-icon"
import { ChartCard, ChartEmpty, Segmented, TooltipCard, formatCompact, formatDay, formatFull, formatSpan } from "@/components/analytics/parts"

/*
 * The Analytics page's charts. Colors: the validated categorical slots (--viz-*) follow each
 * platform; "failed" uses the reserved critical status color and is always labeled.
 */

type TooltipProps = { active?: boolean; payload?: readonly { payload?: Record<string, unknown> }[] }

const axisProps = { tickLine: false, axisLine: false, tickMargin: 8, fontSize: 11 } as const

// ---- Views & engagement trend ----

export function TrendChart({ report, hasMetrics }: { report: AnalyticsReport; hasMetrics: boolean }) {
  const [metric, setMetric] = useState<TrendMetric>("views")
  const label = TREND_METRICS.find((m) => m.key === metric)!.label
  const anyData = report.trend.some((t) => t.posts > 0)
  const reported = report.trend.some((t) => t.posts > 0 && t[metric] !== null)
  const config = { value: { label, color: "var(--viz-1)" } } satisfies ChartConfig
  const data = report.trend.map((t) => ({ ...t, value: t[metric] }))

  return (
    <ChartCard
      title="Views & engagement"
      description={`Lifetime ${label.toLowerCase()} of posts, by the ${report.granularity} they were published`}
      Icon={LineChart}
      tone="bg-violet-500/12 text-violet-600 dark:text-violet-400"
      action={<Segmented label="Metric" value={metric} onChange={setMetric} options={TREND_METRICS.map((m) => ({ key: m.key, label: m.label }))} />}
    >
      {!anyData || !reported ? (
        <ChartEmpty
          Icon={LineChart}
          className="min-h-64"
          title={!hasMetrics ? "No analytics yet" : !anyData ? "No posts with analytics in this period" : `${label} not reported yet`}
          description={
            !hasMetrics
              ? "Once your accounts sync, each post's views and engagement show up here."
              : !anyData
                ? "Pick a longer range, or check back after your next posts go out."
                : "The platforms haven't reported this metric for these posts. Try another one."
          }
        />
      ) : (
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="key" {...axisProps} minTickGap={28} tickFormatter={formatDay} />
            <YAxis {...axisProps} width={44} tickFormatter={(v: number) => formatCompact(v)} allowDecimals={false} />
            <ChartTooltip
              cursor={{ strokeWidth: 1 }}
              content={({ active, payload }: TooltipProps) => {
                const p = active && payload?.[0]?.payload
                if (!p) return null
                const posts = Number(p.posts)
                return (
                  <TooltipCard
                    title={`${formatSpan(String(p.start), String(p.end))} · ${posts} post${posts === 1 ? "" : "s"}`}
                    rows={[{ color: "var(--viz-1)", label, value: p.value === null ? "not reported" : formatFull(Number(p.value)) }]}
                  />
                )
              }}
            />
            <Area
              dataKey="value"
              type="monotone"
              stroke="var(--color-value)"
              strokeWidth={2}
              fill="url(#trend-fill)"
              connectNulls
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
              animationDuration={600}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </ChartCard>
  )
}

// ---- Daily posting activity ----

export function ActivityChart({ report }: { report: AnalyticsReport }) {
  const any = report.activity.some((a) => a.published + a.failed > 0)
  const anyFailed = report.activity.some((a) => a.failed > 0)
  const config = {
    published: { label: "Published", color: "var(--viz-1)" },
    failed: { label: "Failed", color: "var(--viz-critical)" },
  } satisfies ChartConfig

  return (
    <ChartCard
      title={report.granularity === "day" ? "Daily posting activity" : "Weekly posting activity"}
      description="Platform posts the app sent out, and any that failed"
      Icon={BarChart3}
      tone="bg-blue-500/12 text-blue-600 dark:text-blue-400"
      action={
        any && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-(--viz-1)" /> Published
            </span>
            {anyFailed && (
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px] bg-(--viz-critical)" /> Failed
              </span>
            )}
          </div>
        )
      }
    >
      {!any ? (
        <ChartEmpty Icon={BarChart3} className="min-h-56" title="No posts went out in this period" description="Scheduled posts show up here as they publish." />
      ) : (
        <ChartContainer config={config} className="aspect-auto h-56 w-full">
          <BarChart data={report.activity} margin={{ left: 0, right: 8, top: 8 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="key" {...axisProps} minTickGap={28} tickFormatter={formatDay} />
            <YAxis {...axisProps} width={32} allowDecimals={false} />
            <ChartTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }: TooltipProps) => {
                const p = active && payload?.[0]?.payload
                if (!p) return null
                const rows = [{ color: "var(--viz-1)", label: "published", value: formatFull(Number(p.published)) }]
                if (Number(p.failed) > 0) rows.push({ color: "var(--viz-critical)", label: "failed", value: formatFull(Number(p.failed)) })
                return <TooltipCard title={formatSpan(String(p.start), String(p.end))} rows={rows} />
              }}
            />
            {/* 2px surface gap between the stacked segments */}
            <Bar dataKey="published" stackId="a" fill="var(--color-published)" stroke="var(--card)" strokeWidth={1} radius={anyFailed ? [0, 0, 0, 0] : [4, 4, 0, 0]} maxBarSize={28} animationDuration={500} />
            {anyFailed && <Bar dataKey="failed" stackId="a" fill="var(--color-failed)" stroke="var(--card)" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={28} animationDuration={500} />}
          </BarChart>
        </ChartContainer>
      )}
    </ChartCard>
  )
}

// ---- Platform donut ----

type DonutMetric = "views" | "engagement" | "posts"
const DONUT_METRICS: { key: DonutMetric; label: string }[] = [
  { key: "views", label: "Views" },
  { key: "engagement", label: "Engagement" },
  { key: "posts", label: "Posts" },
]

export function PlatformDonut({ report, hasMetrics }: { report: AnalyticsReport; hasMetrics: boolean }) {
  const [metric, setMetric] = useState<DonutMetric>("views")
  const label = DONUT_METRICS.find((m) => m.key === metric)!.label
  const rows = report.platforms.map((p) => ({ ...p, value: p[metric] }))
  const slices = rows.filter((r) => r.value !== null && r.value > 0)
  const total = slices.reduce((a, r) => a + (r.value ?? 0), 0)
  const config = Object.fromEntries(rows.map((r) => [r.platform, { label: platformLabel(r.platform), color: platformColor(r.platform) }])) satisfies ChartConfig

  return (
    <ChartCard
      title="Platform performance"
      description={`Share of ${label.toLowerCase()} by platform`}
      Icon={PieIcon}
      tone="bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
      action={<Segmented label="Metric" value={metric} onChange={setMetric} options={DONUT_METRICS} />}
    >
      {rows.length === 0 ? (
        <ChartEmpty
          Icon={PieIcon}
          className="min-h-64"
          title={hasMetrics ? "No post analytics in this period" : "No analytics yet"}
          description={hasMetrics ? "Pick a longer range to compare platforms." : "Each platform's share shows up once your accounts sync."}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center gap-5 sm:flex-row lg:flex-col 2xl:flex-row">
          <div className="relative size-44 shrink-0">
            {slices.length > 0 ? (
              <ChartContainer config={config} className="aspect-square size-44">
                <PieChart>
                  <ChartTooltip
                    content={({ active, payload }: TooltipProps) => {
                      const p = active && payload?.[0]?.payload
                      if (!p) return null
                      const value = Number(p.value)
                      return (
                        <TooltipCard
                          title={platformLabel(String(p.platform))}
                          rows={[{ color: platformColor(String(p.platform)), label: `${label.toLowerCase()} · ${((value / total) * 100).toFixed(1)}%`, value: formatFull(value) }]}
                        />
                      )
                    }}
                  />
                  <Pie data={slices} dataKey="value" nameKey="platform" innerRadius={56} outerRadius={84} paddingAngle={slices.length > 1 ? 2 : 0} cornerRadius={4} stroke="var(--card)" strokeWidth={2} animationDuration={600}>
                    {slices.map((s) => (
                      <Cell key={s.platform} fill={platformColor(s.platform)} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            ) : (
              <div className="size-44 rounded-full border-[14px] border-muted" />
            )}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-semibold tabular-nums">{slices.length ? formatCompact(total) : "—"}</span>
              <span className="text-[11px] text-muted-foreground">{label.toLowerCase()}</span>
            </div>
          </div>

          {/* Direct labels: every value is readable without hovering */}
          <ul className="flex w-full min-w-0 flex-col gap-2.5">
            {rows.map((r) => {
              const share = r.value && total ? (r.value / total) * 100 : null
              return (
                <li key={r.platform} className="flex items-center gap-2.5 text-sm">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: platformColor(r.platform) }} />
                  <PlatformIcon platform={r.platform} className="size-3.5 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{platformLabel(r.platform)}</span>
                  <span className="font-semibold tabular-nums">{r.value === null ? <span className="text-xs font-normal text-muted-foreground">not reported</span> : formatCompact(r.value)}</span>
                  <span className="w-11 text-right text-xs text-muted-foreground tabular-nums">{share === null ? "" : `${share.toFixed(0)}%`}</span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </ChartCard>
  )
}
