import "server-only"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { AgentStore } from "@/lib/agents/store"

export const jsonError = (status: number, error: string) => Response.json({ error }, { status })

/**
 * Checks the session and that the campaign belongs to the caller (RLS only returns their own),
 * then returns a store scoped to it. /api routes skip the proxy, so every route calls this.
 */
export async function authorizeCampaign(campaignId: string) {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  if (!data?.user) return { error: jsonError(401, "Not signed in") } as const

  const { data: campaign } = await insforge.database.from("campaign").select("id, name").eq("id", campaignId).maybeSingle()
  if (!campaign) return { error: jsonError(404, "Campaign not found") } as const

  return { store: new AgentStore(insforge, campaignId), campaignName: String(campaign.name) } as const
}
