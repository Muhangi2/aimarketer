import { chatRequestSchema, streamAgentReply } from "@/lib/ai/chat"
import { isAgentKey } from "@/lib/agent-roles"
import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"
import { StoreError } from "@/lib/agents/store"

// Streams a regular agent's answer to a user question. Tasks only come from the Master Agent
export async function POST(request: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params
  if (!isAgentKey(agent)) return jsonError(404, "Unknown agent")

  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, "Invalid chat request")
  const { campaignId, message } = parsed.data

  const auth = await authorizeCampaign(campaignId)
  if ("error" in auth) return auth.error

  try {
    const stream = await streamAgentReply({
      agentKey: agent,
      message,
      store: auth.store,
      campaignName: auth.campaignName,
      signal: request.signal,
    })
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    console.error(`Agent "${agent}" failed`, error)
    if (error instanceof StoreError) return jsonError(500, "Your message couldn't be saved. Please try again.")
    return jsonError(502, "The AI model is unavailable. Check that the model server is running.")
  }
}
