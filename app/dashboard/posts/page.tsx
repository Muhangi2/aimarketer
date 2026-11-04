import { getDashboardContext } from "@/lib/dashboard"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { listPosts } from "@/lib/posts/store"
import { PostsBoard } from "@/components/posts/posts-board"

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { activeCampaign } = await getDashboardContext()
  const [posts, { saved }] = await Promise.all([listPosts(await createInsForgeServerClient(), activeCampaign.id), searchParams])

  return <PostsBoard key={activeCampaign.id} posts={posts} highlightId={saved} />
}
