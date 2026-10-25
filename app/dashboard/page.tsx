import { getDashboardContext } from "@/lib/dashboard"
import { getOfficeScene } from "@/lib/office-scene"
import { OverviewWorkspace } from "@/components/dashboard/overview-workspace"
import {
  CampaignStatusPanel,
  RecentActivityPanel,
  UpcomingPostsPanel,
  type ActivityItem,
  type ScheduledPost,
} from "@/components/dashboard/overview-panels"

export default async function DashboardOverviewPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { user, activeCampaign: campaign } = await getDashboardContext()
  const firstName = user.name.split(" ")[0]
  const [officeScene, { agent }] = await Promise.all([getOfficeScene(campaign.office_image), searchParams])

  // Posts, channels and activity are not stored yet; wire these up once their tables exist
  const scheduledPosts: ScheduledPost[] = []
  const activity: ActivityItem[] = []

  const steps = [
    { label: "Create your first campaign", done: true },
    { label: "Connect your social accounts", done: false },
    { label: "Brief your AI agents", done: false },
    { label: "Schedule your first post", done: scheduledPosts.length > 0 },
  ]

  return (
    <div key={campaign.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <OverviewWorkspace
        scene={officeScene}
        campaignId={campaign.id}
        userInitial={user.name.trim()[0]?.toUpperCase() ?? "U"}
        initialSeatId={agent}
      >
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName} 👋</h2>
          <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what&apos;s happening with your campaign today.</p>
        </div>
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
