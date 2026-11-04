import { getDashboardContext } from "@/lib/dashboard"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { getPublishingSetup } from "@/lib/posts/accounts"
import { refreshOverduePostsFor } from "@/lib/posts/publish"
import { listPosts } from "@/lib/posts/store"
import { CalendarView } from "@/components/calendar/calendar-view"

/* The active campaign's posts on a month or week calendar, with drag and drop rescheduling. */
export default async function CalendarPage() {
  const { activeCampaign } = await getDashboardContext()
  const insforge = await createInsForgeServerClient()
  await refreshOverduePostsFor(insforge)
  const [posts, setup] = await Promise.all([listPosts(insforge, activeCampaign.id, 500), getPublishingSetup(insforge)])
  return <CalendarView key={activeCampaign.id} campaign={activeCampaign} posts={posts} accounts={setup.accounts} />
}
