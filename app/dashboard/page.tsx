import { CalendarClock, FileCheck2, Send, Sparkles } from "lucide-react"
import { getDashboardContext } from "@/lib/dashboard"
import { getOfficeScene } from "@/lib/office-scene"
import { getWorkspaceSnapshot } from "@/lib/agents/snapshot"
import { OverviewWorkspace } from "@/components/dashboard/overview-workspace"
import {
  OverviewHeader,
  OverviewStats,
  RecentActivityPanel,
  SetupChecklist,
  UpcomingPostsPanel,
  type ActivityItem,
  type OverviewStat,
  type ScheduledPost,
} from "@/components/dashboard/overview-panels"
import type { RequestStatus } from "@/lib/agents/types"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { PLATFORMS, isPostPlatform } from "@/lib/posts/platforms"
import { listPosts, listUpcomingPosts } from "@/lib/posts/store"

const REQUEST_ACTIVITY: Record<RequestStatus, string> = {
  planning: "is planning",
  running: "is working on",
  awaiting_clarification: "needs your input on",
  waiting: "put on hold",
  completed: "completed",
  failed: "couldn't finish",
  cancelled: "cancelled",
}

export default async function DashboardOverviewPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { user, activeCampaign: campaign } = await getDashboardContext()
  const firstName = user.name.split(" ")[0]
  const insforge = await createInsForgeServerClient()
  const [officeScene, snapshot, { agent }, upcoming, posts] = await Promise.all([
    getOfficeScene(campaign.office_image),
    getWorkspaceSnapshot(campaign.id, user.id),
    searchParams,
    listUpcomingPosts(insforge, campaign.id, 8),
    listPosts(insforge, campaign.id),
  ])

  const label = (p: string) => (isPostPlatform(p) ? PLATFORMS[p].label : p)
  const scheduledPosts: ScheduledPost[] = upcoming.map((p) => ({
    id: p.id,
    content: p.title,
    channel: p.platforms.map(label).join(", "),
    scheduledAt: p.scheduledAt!,
    image: p.media.find((m) => m.kind === "image")?.url ?? null,
  }))

  const count = (...statuses: string[]) => posts.filter((p) => statuses.includes(p.status)).length
  const published = count("published")
  const toReview = count("draft", "pending")
  const stats: OverviewStat[] = [
    { label: "Scheduled", value: count("scheduled"), hint: "Ready to go out", href: "/dashboard/calendar", Icon: CalendarClock },
    { label: "To review", value: toReview, hint: toReview ? "Drafts waiting for you" : "All caught up", href: "/dashboard/posts", Icon: FileCheck2 },
    { label: "Published", value: published, hint: "Posts that went live", href: "/dashboard/posts", Icon: Send },
    {
      label: "AI drafts",
      value: posts.filter((p) => p.source === "agent").length,
      hint: "Written by your agents",
      href: "/dashboard/posts",
      Icon: Sparkles,
    },
  ]

  // Recent Master Agent requests double as the activity feed
  const activity: ActivityItem[] = snapshot.requests.slice(0, 5).map((r) => ({
    id: r.id,
    kind: "agent",
    message: `Master Agent ${REQUEST_ACTIVITY[r.status]}: ${r.prompt.length > 80 ? `${r.prompt.slice(0, 80)}…` : r.prompt}`,
    createdAt: new Date(r.updatedAt).toISOString(),
  }))

  const steps = [
    { label: "Create your first campaign", done: true, href: "/dashboard" },
    { label: "Connect your social accounts", done: false, href: "/dashboard/accounts" },
    { label: "Brief your AI agents", done: snapshot.requests.length > 0, href: "/dashboard/agent" },
    { label: "Schedule your first post", done: scheduledPosts.length > 0 || published > 0, href: "/dashboard/posts/new" },
  ]

  return (
    <div key={campaign.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <OverviewWorkspace
        scene={officeScene}
        campaignId={campaign.id}
        userInitial={user.name.trim()[0]?.toUpperCase() ?? "U"}
        initialSelection={agent}
        snapshot={snapshot}
        header={<OverviewHeader firstName={firstName} campaign={campaign} />}
        stats={<OverviewStats stats={stats} />}
        aside={
          <>
            <SetupChecklist steps={steps} />
            <RecentActivityPanel activity={activity} />
          </>
        }
      >
        <UpcomingPostsPanel posts={scheduledPosts} />
      </OverviewWorkspace>
    </div>
  )
}
