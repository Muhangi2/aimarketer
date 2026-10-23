import Image from "next/image"
import { redirect } from "next/navigation"
import {
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  Circle,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Settings,
  Share2,
} from "lucide-react"
import { cn } from "cn"
import { signOut } from "@/app/actions/auth"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { getUserCampaign } from "@/lib/campaign"
import { CampaignIcon } from "@/components/campaign/campaign-icon"
import { Brand } from "@/components/brand"
import { Button } from "@/components/ui/button"

const NAV = [
  { label: "Overview", Icon: LayoutDashboard, active: true },
  { label: "Campaigns", Icon: Megaphone },
  { label: "AI Agents", Icon: Bot },
  { label: "Calendar", Icon: CalendarDays },
  { label: "Analytics", Icon: BarChart3 },
  { label: "Settings", Icon: Settings },
]

export default async function DashboardPage() {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  const user = data?.user
  if (!user) redirect("/sign-in")

  const campaign = await getUserCampaign(insforge, user.id)
  if (!campaign) redirect("/create-campaign")

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("name, email, avatar_url")
    .eq("user_id", user.id)
    .maybeSingle()

  const name = profile?.name ?? user.profile?.name ?? user.email
  const firstName = name.split(" ")[0]
  const initials = name
    .split(/\s+/)
    .map((p: string) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const steps = [
    { label: "Create your first campaign", done: true },
    { label: "Connect your social accounts", done: false },
    { label: "Brief your AI agents", done: false },
    { label: "Schedule your first post", done: false },
  ]
  const completed = steps.filter((s) => s.done).length

  return (
    <div className="flex h-svh overflow-hidden bg-muted/50">
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-card px-4 py-5 md:flex">
        <Brand className="px-2" />
        <nav className="mt-8 flex flex-col gap-1">
          {NAV.map(({ label, Icon, active }) => (
            <span
              key={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                active ? "bg-accent text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-4" />
              {label}
              {!active && <span className="ml-auto text-[10px] font-medium text-muted-foreground/70">Soon</span>}
            </span>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-3 rounded-xl border bg-background p-3">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="size-9 rounded-full" />
          ) : (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{profile?.email ?? user.email}</p>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out">
              <LogOut />
            </Button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-card px-4 sm:px-6">
          <div className="md:hidden">
            <Brand />
          </div>
          <div className="hidden md:block">
            <h1 className="text-lg font-semibold tracking-tight">Welcome back, {firstName}</h1>
            <p className="text-xs text-muted-foreground">Here&apos;s what&apos;s happening with your campaign.</p>
          </div>
          <form action={signOut} className="md:hidden">
            <Button type="submit" variant="ghost" size="sm">
              <LogOut /> Sign out
            </Button>
          </form>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
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
                      <span className="size-1.5 rounded-full bg-emerald-400" /> Active
                    </span>
                    <h2 className="mt-1.5 truncate text-2xl font-semibold tracking-tight">{campaign.name}</h2>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x">
                {[
                  { label: "Scheduled posts", value: "0", Icon: CalendarDays },
                  { label: "Channels", value: "0", Icon: Share2 },
                  { label: "Created", value: new Date(campaign.created_at).toLocaleDateString(), Icon: Megaphone },
                ].map(({ label, value, Icon }) => (
                  <div key={label} className="flex items-center gap-3 p-4 sm:p-5">
                    <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary sm:flex">
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
                  className="h-full rounded-full bg-primary"
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
        </main>
      </div>
    </div>
  )
}
