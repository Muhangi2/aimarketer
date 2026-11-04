import { notFound, redirect } from "next/navigation"
import { getDashboardContext } from "@/lib/dashboard"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { getPost } from "@/lib/posts/store"
import { getPublishingSetup } from "@/lib/posts/accounts"
import { isEditablePost } from "@/lib/posts/types"
import { PostComposer } from "@/components/posts/post-composer"

/* Edit or reschedule a post that hasn't been published yet. */
export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ activeCampaign }, { id }] = await Promise.all([getDashboardContext(), params])
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const insforge = await createInsForgeServerClient()
  const [post, setup] = await Promise.all([getPost(insforge, activeCampaign.id, id), getPublishingSetup(insforge)])
  if (!post) notFound()
  // Published posts can't change: back to the list
  if (!isEditablePost(post)) redirect("/dashboard/posts")

  return <PostComposer key={post.id} campaign={activeCampaign} post={post} accounts={setup.accounts} blotatoInvalid={setup.blotatoInvalid} />
}
