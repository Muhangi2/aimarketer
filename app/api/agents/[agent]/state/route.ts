import { z } from "zod"
import { isAgentKey } from "@/lib/agent-roles"
import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"
import { dispatchDueTasks } from "@/lib/agents/dispatch"

const bodySchema = z.object({ campaignId: z.string().uuid(), paused: z.boolean() })

// Pauses or resumes a regular agent. On resume, its overdue tasks are dispatched right away
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
    const dispatched = paused ? [] : await dispatchDueTasks(auth.store, undefined, agent)
    return Response.json({ status, dispatched: dispatched.length })
  } catch (error) {
    console.error(`Could not update ${agent} status`, error)
    return jsonError(500, "Couldn't update the agent. Please try again.")
  }
}
