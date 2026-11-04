import { getDashboardContext } from "@/lib/dashboard"
import { PostComposer } from "@/components/posts/post-composer"

export default async function CreatePostPage() {
  const { activeCampaign } = await getDashboardContext()
  return <PostComposer key={activeCampaign.id} campaign={activeCampaign} />
}
