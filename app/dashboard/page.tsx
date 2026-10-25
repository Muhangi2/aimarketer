import { getDashboardContext } from "@/lib/dashboard"
import { getOfficeScene } from "@/lib/office-scene"
import { AgentOfficePanel } from "@/components/office/agent-office-panel"
import {
  CampaignStatusPanel,
  RecentActivityPanel,
  UpcomingPostsPanel,
  type ActivityItem,
  type ScheduledPost,
} from "@/components/dashboard/overview-panels"

export default async function DashboardOverviewPage() {
  const { user, activeCampaign: campaign } = await getDashboardContext()
  const firstName = user.name.split(" ")[0]
  const officeScene = await getOfficeScene(campaign.office_image)

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
    <div key={campaign.id} className="grid gap-6 p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 sm:p-6 lg:grid-cols-2 lg:p-8">
      <div className="flex min-w-0 flex-col gap-6">
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
      </div>

      {/* Full window height (minus the 4rem header and page padding), pinned while the left column scrolls */}
      <div className="min-w-0 lg:sticky lg:top-8 lg:h-[calc(100svh-8rem)] lg:self-start">
        <AgentOfficePanel scene={officeScene} className="lg:h-full" />
      </div>
    </div>
  )
}
