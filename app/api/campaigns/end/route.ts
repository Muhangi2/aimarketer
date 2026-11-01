import { z } from "zod"
import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"
import { stopCampaignPlans } from "@/lib/computers/campaign"
import { getInsForgeAdmin } from "@/lib/insforge/admin"
import { inngest } from "@/lib/inngest/client"

const bodySchema = z.object({ campaignId: z.string().uuid() })

/**
 * Ends a campaign: plans stop now; in the background the files left on its computers are
 * uploaded and the computers are shut down for good. Can't be undone.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, "Invalid request")
  const { campaignId } = parsed.data

  const auth = await authorizeCampaign(campaignId)
  if ("error" in auth) return auth.error
  const userId = auth.store.userId

  try {
    const { data, error } = await getInsForgeAdmin()
      .database.from("campaign")
      .update({ status: "ending" })
      .eq("id", campaignId)
      .eq("user_id", userId)
      .eq("status", "active")
      .select("id")
      .maybeSingle()
    if (error) throw error
    if (!data) return jsonError(409, "This campaign has already ended.")

    await stopCampaignPlans(campaignId, userId)
    await inngest.send({ name: "campaign/end", data: { campaignId, userId } })
    return Response.json({ status: "ending" }, { status: 202 })
  } catch (error) {
    console.error("Could not end the campaign", error)
    return jsonError(500, "Couldn't end the campaign. Please try again.")
  }
}
