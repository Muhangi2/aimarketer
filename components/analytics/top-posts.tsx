import { ExternalLink, Trophy } from "lucide-react"
import { cn } from "cn"
import type { AnalyticsReport } from "@/lib/analytics/compute"
import { platformLabel } from "@/lib/analytics/types"
import { PLATFORMS, isPostPlatform } from "@/lib/posts/platforms"
import { PlatformIcon } from "@/components/posts/platform-icon"
import { ChartCard, ChartEmpty, formatCompact } from "@/components/analytics/parts"

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })

export function TopPosts({ report, hasMetrics }: { report: AnalyticsReport; hasMetrics: boolean }) {
  const posts = report.topPosts

  return (
    <ChartCard title="Top posts" description="Your best performers in this period, by views" Icon={Trophy} tone="bg-amber-500/15 text-amber-600 dark:text-amber-400">
      {posts.length === 0 ? (
        <ChartEmpty
          Icon={Trophy}
          className="min-h-56"
          title={hasMetrics ? "No post analytics in this period" : "No analytics yet"}
          description={hasMetrics ? "Pick a longer range to see your best posts." : "Your top posts show up once your accounts sync."}
        />
      ) : (
        <ol className="-mx-2 flex flex-col">
          {posts.map((p, i) => {
            const tone = isPostPlatform(p.platform) ? PLATFORMS[p.platform].tone : "bg-muted text-muted-foreground"
            const Row = p.url ? "a" : "div"
            return (
              <li key={p.id}>
                <Row
                  {...(p.url ? { href: p.url, target: "_blank", rel: "noreferrer" } : {})}
                  className={cn("group flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors", p.url && "hover:bg-muted/60")}
                >
                  <span className="w-4 shrink-0 text-center text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className={cn("relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg", tone)}>
                    {p.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- platform CDN thumbnails
                      <img src={p.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                      <PlatformIcon platform={p.platform} className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p.content.trim() || "Untitled post"}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <PlatformIcon platform={p.platform} className="size-3" />
                      {platformLabel(p.platform)}
                      {p.publishedAt && ` · ${dateFormat.format(new Date(p.publishedAt))}`}
                      {p.pending && " · metrics pending"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums">{formatCompact(p.views)}</span>
                    <span className="block text-[11px] text-muted-foreground tabular-nums">
                      {p.engagement === null ? "no engagement data" : `${formatCompact(p.engagement)} eng.${p.engagementRate !== null ? ` · ${p.engagementRate.toFixed(1)}%` : ""}`}
                    </span>
                  </span>
                  {p.url && <ExternalLink className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
                </Row>
              </li>
            )
          })}
        </ol>
      )}
    </ChartCard>
  )
}
