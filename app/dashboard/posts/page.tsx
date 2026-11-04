import { getDashboardContext } from "@/lib/dashboard"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { listPosts } from "@/lib/posts/store"
import { refreshOverduePostsFor } from "@/lib/posts/publish"
import { PostsBoard } from "@/components/posts/posts-board"

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { activeCampaign } = await getDashboardContext()
  const insforge = await createInsForgeServerClient()
  // Posts Zernio published while the publish job wasn't running get their final status first
  await refreshOverduePostsFor(insforge)
  const [posts, { saved }] = await Promise.all([listPosts(insforge, activeCampaign.id), searchParams])

  return <PostsBoard key={activeCampaign.id} posts={posts} highlightId={saved} />
}
