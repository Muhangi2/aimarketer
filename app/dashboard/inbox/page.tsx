import { getDashboardContext } from "@/lib/dashboard"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { zernioConfigured } from "@/lib/zernio/client"
import { getZernioProfile } from "@/lib/zernio/store"
import { Inbox } from "@/components/inbox/inbox"

export default async function InboxPage() {
  const { activeCampaign } = await getDashboardContext()
  const profile = await getZernioProfile(await createInsForgeServerClient())
  return <Inbox campaignId={activeCampaign.id} connected={Boolean(profile?.accounts.length)} configured={zernioConfigured()} />
}
