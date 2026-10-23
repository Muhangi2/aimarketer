"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { ACTIVE_CAMPAIGN_COOKIE } from "@/lib/campaign"
import { listOffices } from "@/lib/offices"
import { isPresetIcon } from "@/components/campaign/campaign-icon"

export type CreateCampaignInput = {
  name: string
  iconType: "preset" | "custom"
  icon: string
  iconKey?: string
  officeImage: string
}

const ACTIVE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
}

export async function createCampaign(input: CreateCampaignInput): Promise<{ error: string }> {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  const user = data?.user
  if (!user) redirect("/sign-in")

  const name = input.name.trim()
  if (!name || name.length > 80) return { error: "Campaign name must be 1–80 characters." }

  if (input.iconType === "preset") {
    if (!isPresetIcon(input.icon)) return { error: "Choose a valid icon." }
  } else {
    const ownsUpload =
      input.iconKey?.startsWith(`${user.id}/`) &&
      input.icon.startsWith(`${process.env.NEXT_PUBLIC_INSFORGE_URL}/`)
    if (!ownsUpload) return { error: "Custom icon upload is invalid. Please upload it again." }
  }

  const offices = await listOffices()
  if (!offices.some((o) => o.src === input.officeImage)) return { error: "Choose an AI agent office." }

  const { data: created, error } = await insforge.database
    .from("campaign")
    .insert([
      {
        user_id: user.id,
        name,
        icon_type: input.iconType,
        icon: input.icon,
        icon_key: input.iconType === "custom" ? input.iconKey : null,
        office_image: input.officeImage,
      },
    ])
    .select("id")
    .single()

  if (error || !created) return { error: error?.message ?? "Could not create the campaign." }

  // Open the dashboard on the campaign that was just created
  ;(await cookies()).set(ACTIVE_CAMPAIGN_COOKIE, created.id, ACTIVE_COOKIE_OPTIONS)
  redirect("/dashboard")
}

export async function setActiveCampaign(campaignId: string) {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  if (!data?.user) redirect("/sign-in")

  // RLS only returns the caller's own campaigns
  const { data: campaign } = await insforge.database
    .from("campaign")
    .select("id")
    .eq("id", campaignId)
    .maybeSingle()
  if (!campaign) return

  ;(await cookies()).set(ACTIVE_CAMPAIGN_COOKIE, campaign.id, ACTIVE_COOKIE_OPTIONS)
  revalidatePath("/dashboard", "layout")
}
