import { getDashboardContext } from "@/lib/dashboard"
import { getOfficeScene } from "@/lib/office-scene"
import { getWorkspaceSnapshot } from "@/lib/agents/snapshot"
import { OverviewWorkspace } from "@/components/dashboard/overview-workspace"
import {
  CampaignStatusPanel,
  RecentActivityPanel,
  UpcomingPostsPanel,
  type ActivityItem,
  type ScheduledPost,
} from "@/components/dashboard/overview-panels"
import type { RequestStatus } from "@/lib/agents/types"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { PLATFORMS, isPostPlatform } from "@/lib/posts/platforms"
import { listUpcomingPosts } from "@/lib/posts/store"

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
  const [officeScene, snapshot, { agent }, upcoming] = await Promise.all([
    getOfficeScene(campaign.office_image),
    getWorkspaceSnapshot(campaign.id, user.id),
    searchParams,
    listUpcomingPosts(await createInsForgeServerClient(), campaign.id),
  ])

  // Channels are not stored yet; wire them up once their table exists
  const scheduledPosts: ScheduledPost[] = upcoming.map((p) => ({
    id: p.id,
    content: p.title,
    channel: p.platforms.map((x) => (isPostPlatform(x) ? PLATFORMS[x].label : x)).join(", "),
    scheduledAt: p.scheduledAt!,
  }))
  // Recent Master Agent requests double as the activity feed
  const activity: ActivityItem[] = snapshot.requests.slice(0, 5).map((r) => ({
    id: r.id,
    kind: "agent",
    message: `Master Agent ${REQUEST_ACTIVITY[r.status]}: ${r.prompt.length > 80 ? `${r.prompt.slice(0, 80)}…` : r.prompt}`,
    createdAt: new Date(r.updatedAt).toISOString(),
  }))

  const steps = [
    { label: "Create your first campaign", done: true },
    { label: "Connect your social accounts", done: false },
    { label: "Brief your AI agents", done: snapshot.requests.length > 0 },
    { label: "Schedule your first post", done: scheduledPosts.length > 0 },
  ]

  return (
    <div key={campaign.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <OverviewWorkspace
        scene={officeScene}
        campaignId={campaign.id}
        userInitial={user.name.trim()[0]?.toUpperCase() ?? "U"}
        initialSelection={agent}
        snapshot={snapshot}
        header={
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName} 👋</h2>
            <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what&apos;s happening with your campaign today.</p>
          </div>
        }
      >
        <CampaignStatusPanel
          campaign={campaign}
          steps={steps}
          scheduledCount={scheduledPosts.length}
          publishedCount={0}
          channelCount={0}
        />
        <UpcomingPostsPanel posts={scheduledPosts} />
        <RecentActivityPanel activity={activity} />
      </OverviewWorkspace>
    </div>
  )
}
