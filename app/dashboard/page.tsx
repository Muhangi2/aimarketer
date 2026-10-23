import Image from "next/image"
import { Bot, CalendarDays, CheckCircle2, Circle, Megaphone, Share2 } from "lucide-react"
import { cn } from "cn"
import { getDashboardContext } from "@/lib/dashboard"
import { CampaignIcon } from "@/components/campaign/campaign-icon"

export default async function DashboardOverviewPage() {
  const { user, activeCampaign: campaign } = await getDashboardContext()
  const firstName = user.name.split(" ")[0]

  const steps = [
    { label: "Create your first campaign", done: true },
    { label: "Connect your social accounts", done: false },
    { label: "Brief your AI agents", done: false },
    { label: "Schedule your first post", done: false },
  ]
  const completed = steps.filter((s) => s.done).length

  return (
    <div key={campaign.id} className="mx-auto flex max-w-6xl flex-col gap-6 p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 sm:p-6 lg:p-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName} 👋</h2>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what&apos;s happening with your campaign today.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="relative aspect-[16/7] bg-muted">
            <Image
              src={campaign.office_image}
              alt="AI agent office"
              fill
              priority
              sizes="(min-width: 1024px) 800px, 100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-5 text-white">
              <CampaignIcon
                type={campaign.icon_type}
                icon={campaign.icon}
                className="size-14 bg-white shadow-lg ring-4 ring-white/30"
              />
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium backdrop-blur">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> Active
                </span>
                <h3 className="mt-1.5 truncate text-2xl font-semibold tracking-tight">{campaign.name}</h3>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x">
            {[
              { label: "Scheduled posts", value: "0", Icon: CalendarDays, tone: "bg-amber-500/12 text-amber-600" },
              { label: "Channels", value: "0", Icon: Share2, tone: "bg-sky-500/12 text-sky-600" },
              {
                label: "Created",
                value: new Date(campaign.created_at).toLocaleDateString(),
                Icon: Megaphone,
                tone: "bg-blue-500/12 text-blue-600",
              },
            ].map(({ label, value, Icon, tone }) => (
              <div key={label} className="flex items-center gap-3 p-4 sm:p-5">
                <span className={cn("hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex", tone)}>
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">{label}</p>
                  <p className="truncate text-base font-semibold">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Getting started</h3>
            <span className="text-xs font-medium text-muted-foreground">
              {completed}/{steps.length}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700"
              style={{ width: `${(completed / steps.length) * 100}%` }}
            />
          </div>
          <ul className="mt-5 flex flex-col gap-3">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                {s.done ? (
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground/50" />
                )}
                <span className={cn(s.done && "text-muted-foreground line-through")}>{s.label}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 p-4 text-white">
            <Bot className="size-5" />
            <p className="mt-2 text-sm font-medium">Your AI agents are ready</p>
            <p className="mt-1 text-xs text-blue-100">
              They&apos;re set up in your office and waiting for their first brief.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
