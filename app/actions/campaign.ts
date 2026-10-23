"use server"

import { redirect } from "next/navigation"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { getUserCampaign } from "@/lib/campaign"
import { listOffices } from "@/lib/offices"
import { isPresetIcon } from "@/components/campaign/campaign-icon"

export type CreateCampaignInput = {
  name: string
  iconType: "preset" | "custom"
  icon: string
  iconKey?: string
  officeImage: string
}

export async function createCampaign(input: CreateCampaignInput): Promise<{ error: string }> {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  const user = data?.user
  if (!user) redirect("/sign-in")

  if (await getUserCampaign(insforge, user.id)) redirect("/dashboard")

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

  const { error } = await insforge.database.from("campaign").insert([
    {
      user_id: user.id,
      name,
      icon_type: input.iconType,
      icon: input.icon,
      icon_key: input.iconType === "custom" ? input.iconKey : null,
      office_image: input.officeImage,
    },
  ])

  if (error) return { error: error.message ?? "Could not create the campaign." }

  redirect("/dashboard")
}
