import Link from "next/link"
import { format, formatDistanceToNow, isToday, isTomorrow } from "date-fns"
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  CalendarClock,
  CalendarDays,
  Check,
  FileText,
  History,
  PenSquare,
  Send,
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
  image?: string | null
}

export type ActivityItem = {
  id: string
  kind: "agent" | "post" | "account"
  message: string
  createdAt: string
}

export type SetupStep = { label: string; done: boolean; href: string }

export type OverviewStat = {
  label: string
  value: number
  hint: string
  href: string
  Icon: LucideIcon
}

/* ---------- Building blocks ---------- */

function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col rounded-2xl border border-border bg-card", className)}>
      <header className="flex items-center gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium">{title}</h3>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children} <ArrowRight className="size-3" />
    </Link>
  )
}

function PanelEmpty({ Icon, title, description, children }: { Icon: LucideIcon; title: string; description: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 pt-4 pb-8 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-brand-wash text-brand ring-1 ring-brand/10">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-balance text-muted-foreground">{description}</p>
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
    </div>
  )
}

/* ---------- Page header ---------- */

export function OverviewHeader({ firstName, campaign }: { firstName: string; campaign: Campaign }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        <CampaignIcon type={campaign.icon_type} icon={campaign.icon} className="size-12 shrink-0 rounded-2xl" />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {greeting()}, {firstName}
          </p>
          <h2 className="truncate text-2xl font-medium tracking-[-0.03em] sm:text-[1.75rem]">{campaign.name}</h2>
        </div>
      </div>
      <div className="flex gap-2">
        <Link href="/dashboard/agent" className={buttonVariants({ variant: "outline", size: "lg" })}>
          <Bot data-icon="inline-start" /> Brief agents
        </Link>
        <Link href="/dashboard/posts/new" className={buttonVariants({ size: "lg" })}>
          <PenSquare data-icon="inline-start" /> New post
        </Link>
      </div>
    </div>
  )
}

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
}

/* ---------- Key numbers ---------- */

export function OverviewStats({ stats }: { stats: OverviewStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(({ label, value, hint, href, Icon }) => (
        <Link
          key={label}
          href={href}
          className="group rounded-2xl border border-border bg-card p-4 transition-[border-color,box-shadow] hover:border-brand/30 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.12)] dark:hover:shadow-none sm:p-5"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-2 text-xs font-medium">
              <Icon className="size-4" /> {label}
            </span>
            <ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <p className="mt-3 text-3xl font-medium tracking-[-0.03em] tabular-nums">{value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
        </Link>
      ))}
    </div>
  )
}

/* ---------- Setup checklist (side column, hidden once complete) ---------- */

export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const completed = steps.filter((s) => s.done).length
  if (completed === steps.length) return null
  const percent = Math.round((completed / steps.length) * 100)

  return (
    <Panel title="Get set up" description={`${completed} of ${steps.length} done`}>
      <div className="px-5">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ul className="p-2 pt-3">
        {steps.map((s) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                s.done ? "text-muted-foreground" : "hover:bg-muted"
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full",
                  s.done ? "bg-brand text-white" : "border border-dashed border-muted-foreground/40"
                )}
              >
                {s.done && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className={cn("flex-1", s.done && "line-through")}>{s.label}</span>
              {!s.done && <ArrowRight className="size-3.5 text-muted-foreground" />}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/* ---------- Upcoming posts, grouped by day ---------- */

function dayLabel(date: Date) {
  if (isToday(date)) return "Today"
  if (isTomorrow(date)) return "Tomorrow"
  return format(date, "EEEE, MMM d")
}

export function UpcomingPostsPanel({ posts }: { posts: ScheduledPost[] }) {
  const days = new Map<string, ScheduledPost[]>()
  for (const post of posts) {
    const key = dayLabel(new Date(post.scheduledAt))
    days.set(key, [...(days.get(key) ?? []), post])
  }

  return (
    <Panel title="Coming up" description="Scheduled posts, in order" action={<PanelLink href="/dashboard/calendar">Calendar</PanelLink>}>
      {posts.length === 0 ? (
        <PanelEmpty
          Icon={CalendarDays}
          title="Nothing scheduled yet"
          description="Brief your agents and they will draft posts for you to review and schedule."
        >
          <Link href="/dashboard/agent" className={buttonVariants()}>
            <Bot data-icon="inline-start" /> Brief your agents
          </Link>
          <Link href="/dashboard/posts/new" className={buttonVariants({ variant: "outline" })}>
            <PenSquare data-icon="inline-start" /> Write a post
          </Link>
        </PanelEmpty>
      ) : (
        <div className="px-5 pb-4">
          {[...days].map(([day, items]) => (
            <div key={day} className="border-t border-border py-3 first:border-t-0 first:pt-0">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{day}</p>
              <ul className="space-y-1">
                {items.map((post) => (
                  <li key={post.id}>
                    <Link
                      href={`/dashboard/posts/${post.id}/edit`}
                      className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted"
                    >
                      <span className="w-16 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                        {format(new Date(post.scheduledAt), "h:mm a")}
                      </span>
                      {post.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.image} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <FileText className="size-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{post.content}</span>
                        <span className="block truncate text-xs text-muted-foreground">{post.channel}</span>
                      </span>
                      <CalendarClock className="size-4 shrink-0 text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

/* ---------- Recent activity ---------- */

const ACTIVITY_ICONS: Record<ActivityItem["kind"], LucideIcon> = { agent: Sparkles, post: Send, account: History }

export function RecentActivityPanel({ activity }: { activity: ActivityItem[] }) {
  return (
    <Panel title="Recent activity">
      {activity.length === 0 ? (
        <PanelEmpty Icon={History} title="No activity yet" description="Agent work, approvals and published posts will show up here." />
      ) : (
        <ol className="relative px-5 pb-5">
          {/* Thin line linking the timeline dots */}
          <span aria-hidden className="absolute top-2 bottom-7 left-[33px] w-px bg-border" />
          {activity.map((item) => {
            const Icon = ACTIVITY_ICONS[item.kind]
            return (
              <li key={item.id} className="relative flex items-start gap-3 py-2">
                <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-brand">
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug">{item.message}</p>
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
