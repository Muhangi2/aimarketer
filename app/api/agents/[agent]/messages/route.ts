import { z } from "zod"
import { isThreadKey } from "@/lib/agent-roles"
import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"

const bodySchema = z.object({ campaignId: z.string().uuid() })

// Clears one agent's chat. Tasks and their results are kept
export async function DELETE(request: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params
  if (!isThreadKey(agent)) return jsonError(404, "Unknown agent")

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, "Invalid request")

  const auth = await authorizeCampaign(parsed.data.campaignId)
  if ("error" in auth) return auth.error

  try {
    await auth.store.clearThread(agent)
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error(`Could not clear ${agent} chat`, error)
    return jsonError(500, "Couldn't clear the chat. Please try again.")
  }
}
