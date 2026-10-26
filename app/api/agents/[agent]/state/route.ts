import { z } from "zod"
import { isAgentKey } from "@/lib/agent-roles"
import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"

const bodySchema = z.object({ campaignId: z.string().uuid(), paused: z.boolean() })

// Pauses or resumes a regular agent. Reports whether the Master Agent has work on hold to continue
export async function POST(request: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params
  if (!isAgentKey(agent)) return jsonError(404, "Unknown agent")

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, "Invalid request")
  const { campaignId, paused } = parsed.data

  const auth = await authorizeCampaign(campaignId)
  if ("error" in auth) return auth.error

  try {
    const status = await auth.store.setState(agent, paused ? "paused" : "idle", null, true)
    const open = paused ? null : await auth.store.getOpenRequest()
    return Response.json({ status, resumable: open?.status === "waiting" })
  } catch (error) {
    console.error(`Could not update ${agent} status`, error)
    return jsonError(500, "Couldn't update the agent. Please try again.")
  }
}
