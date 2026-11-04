import Link from "next/link"
import { format, formatDistanceToNow } from "date-fns"
import {
  ArrowRight,
  Bot,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Circle,
  History,
  PenSquare,
  Send,
  Share2,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"
import type { Campaign } from "@/lib/campaign"
import { CampaignIcon } from "@/components/campaign/campaign-icon"
import { buttonVariants } from "@/components/ui/button"

export type ScheduledPost = {
  id: string
  content: string
  channel: string
  scheduledAt: string
}

export type ActivityItem = {
  id: string
  kind: "agent" | "post" | "account"
  message: string
  createdAt: string
}

export type SetupStep = { label: string; done: boolean }

function Panel({
  title,
  description,
  Icon,
  tone,
  action,
  children,
}: {
  title: string
  description: string
  Icon: LucideIcon
  tone: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col rounded-2xl border bg-card shadow-sm">
      <header className="flex items-center gap-3 border-b px-5 py-4">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function PanelEmpty({
  Icon,
  tone,
  title,
  description,
  children,
}: {
  Icon: LucideIcon
  tone: string
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="relative">
        {/* Soft ring behind the icon */}
        <span className={cn("absolute inset-0 scale-150 rounded-full opacity-40 blur-xl", tone)} />
        <span className={cn("relative flex size-14 items-center justify-center rounded-2xl ring-8 ring-muted/60", tone)}>
          <Icon className="size-6" />
        </span>
      </div>
      <p className="mt-6 text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-balance text-muted-foreground">{description}</p>
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  )
}

export function CampaignStatusPanel({
  campaign,
  steps,
  scheduledCount,
  publishedCount,
  channelCount,
}: {
  campaign: Campaign
  steps: SetupStep[]
  scheduledCount: number
  publishedCount: number
  channelCount: number
}) {
  const completed = steps.filter((s) => s.done).length
  const percent = Math.round((completed / steps.length) * 100)
  const nextStep = steps.find((s) => !s.done)

  return (
    <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="flex items-center gap-4 bg-gradient-to-br from-brand/10 via-brand/5 to-transparent p-5">
        <CampaignIcon type={campaign.icon_type} icon={campaign.icon} className="size-12 bg-background shadow-md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-semibold tracking-tight">{campaign.name}</h3>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" /> Active
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Created {format(new Date(campaign.created_at), "MMM d, yyyy")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x border-y">
        {[
          { label: "Scheduled", value: scheduledCount, Icon: CalendarDays, tone: "text-amber-600 dark:text-amber-400" },
          { label: "Published", value: publishedCount, Icon: Send, tone: "text-brand dark:text-brand-glow" },
          { label: "Channels", value: channelCount, Icon: Share2, tone: "text-brand dark:text-brand-glow" },
        ].map(({ label, value, Icon, tone }) => (
          <div key={label} className="px-4 py-3.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className={cn("size-3.5", tone)} /> {label}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Campaign setup</span>
          <span className="text-muted-foreground tabular-nums">{percent}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-brand transition-[width] duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-xs">
              {s.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-primary" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground/40" />
              )}
              <span className={cn("truncate", s.done && "text-muted-foreground line-through")}>{s.label}</span>
            </li>
          ))}
        </ul>
        {nextStep && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-muted/60 p-3">
            <Sparkles className="size-4 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 truncate text-xs">
              <span className="text-muted-foreground">Next up: </span>
              <span className="font-medium">{nextStep.label}</span>
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

export function UpcomingPostsPanel({ posts }: { posts: ScheduledPost[] }) {
  return (
    <Panel
      title="Upcoming posts"
      description="Scheduled across your channels"
      Icon={CalendarClock}
      tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
      action={
        <Link href="/dashboard/calendar" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Calendar <ArrowRight data-icon="inline-end" />
        </Link>
      }
    >
      {posts.length === 0 ? (
        <PanelEmpty
          Icon={CalendarDays}
          tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          title="No posts scheduled yet"
          description="Brief your AI agent and it will draft posts for you to review and schedule."
        >
          <Link href="/dashboard/agent" className={buttonVariants({ size: "lg" })}>
            <Bot data-icon="inline-start" /> Brief your agent
          </Link>
          <Link href="/dashboard/posts" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <PenSquare data-icon="inline-start" /> Write a post
          </Link>
        </PanelEmpty>
      ) : (
        <ul className="divide-y">
          {posts.map((post) => {
            const date = new Date(post.scheduledAt)
            return (
              <li key={post.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex w-11 shrink-0 flex-col items-center rounded-lg border bg-muted/40 py-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">{format(date, "MMM")}</span>
                  <span className="text-base leading-tight font-semibold">{format(date, "d")}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{post.content}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {post.channel} · {format(date, "h:mm a")}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

const ACTIVITY_ICONS: Record<ActivityItem["kind"], { Icon: LucideIcon; tone: string }> = {
  agent: { Icon: Bot, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  post: { Icon: PenSquare, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  account: { Icon: Share2, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
}

export function RecentActivityPanel({ activity }: { activity: ActivityItem[] }) {
  return (
    <Panel
      title="Recent activity"
      description="What your agents and team have been up to"
      Icon={History}
      tone="bg-brand/12 text-brand dark:text-brand-glow"
    >
      {activity.length === 0 ? (
        <PanelEmpty
          Icon={History}
          tone="bg-brand/12 text-brand dark:text-brand-glow"
          title="No activity yet"
          description="Drafts, approvals and published posts will show up here as your campaign gets going."
        />
      ) : (
        <ol className="flex flex-col gap-4 p-5">
          {activity.map((item) => {
            const { Icon, tone } = ACTIVITY_ICONS[item.kind]
            return (
              <li key={item.id} className="flex items-start gap-3">
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", tone)}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm">{item.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </Panel>
  )
}
