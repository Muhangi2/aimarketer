import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { ACTIVE_CAMPAIGN_COOKIE, listUserCampaigns } from "@/lib/campaign"

export type DashboardUser = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

// Shared by the dashboard layout and its pages; cached per request
export const getDashboardContext = cache(async () => {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  const authUser = data?.user
  if (!authUser) redirect("/sign-in")

  const [campaigns, { data: profile }] = await Promise.all([
    listUserCampaigns(insforge, authUser.id),
    insforge.database
      .from("profiles")
      .select("name, avatar_url")
      .eq("user_id", authUser.id)
      .maybeSingle(),
  ])
  if (campaigns.length === 0) redirect("/create-campaign")

  const activeId = (await cookies()).get(ACTIVE_CAMPAIGN_COOKIE)?.value
  const activeCampaign = campaigns.find((c) => c.id === activeId) ?? campaigns[0]

  const user: DashboardUser = {
    id: authUser.id,
    name: profile?.name ?? authUser.profile?.name ?? authUser.email,
    email: authUser.email,
    avatarUrl: profile?.avatar_url ?? authUser.profile?.avatar_url ?? null,
  }

  return { user, campaigns, activeCampaign }
})
