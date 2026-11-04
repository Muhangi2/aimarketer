import { getDashboardContext } from "@/lib/dashboard"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { getPublishingSetup } from "@/lib/posts/accounts"
import { PostComposer } from "@/components/posts/post-composer"

export default async function CreatePostPage() {
  const { activeCampaign } = await getDashboardContext()
  const setup = await getPublishingSetup(await createInsForgeServerClient())
  return <PostComposer key={activeCampaign.id} campaign={activeCampaign} accounts={setup.accounts} blotatoInvalid={setup.blotatoInvalid} />
}
