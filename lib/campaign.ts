import type { createServerClient } from "@insforge/sdk/ssr"

export type Campaign = {
  id: string
  name: string
  icon_type: "preset" | "custom"
  icon: string
  icon_key: string | null
  office_image: string
  created_at: string
}

export const CAMPAIGN_ICON_BUCKET = "campaign-icons"
export const MAX_ICON_BYTES = 2 * 1024 * 1024
export const ACTIVE_CAMPAIGN_COOKIE = "active_campaign"

const CAMPAIGN_COLUMNS = "id, name, icon_type, icon, icon_key, office_image, created_at"

type InsForgeServerClient = ReturnType<typeof createServerClient>

export async function getUserCampaign(insforge: InsForgeServerClient, userId: string): Promise<Campaign | null> {
  const { data } = await insforge.database
    .from("campaign")
    .select(CAMPAIGN_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  return (data as Campaign | null) ?? null
}

export async function listUserCampaigns(insforge: InsForgeServerClient, userId: string): Promise<Campaign[]> {
  const { data } = await insforge.database
    .from("campaign")
    .select(CAMPAIGN_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(50)

  return (data as Campaign[] | null) ?? []
}
