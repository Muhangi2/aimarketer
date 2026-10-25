import { createInsForgeServerClient } from "@/lib/insforge/server"
import { chatRequestSchema, streamAgentReply } from "@/lib/ai/chat"
import { isAgentKey } from "@/lib/agent-roles"

const json = (status: number, error: string) => Response.json({ error }, { status })

// Streams an agent's reply to the signed-in user's conversation
export async function POST(request: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params
  if (!isAgentKey(agent)) return json(404, "Unknown agent")

  // /api routes skip the proxy, so check the session here
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  if (!data?.user) return json(401, "Not signed in")

  const parsed = chatRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return json(400, "Invalid chat request")
  const { campaignId, messages } = parsed.data

  // RLS only returns the caller's own campaigns
  const { data: campaign } = await insforge.database
    .from("campaign")
    .select("name")
    .eq("id", campaignId)
    .maybeSingle()
  if (!campaign) return json(404, "Campaign not found")

  try {
    const stream = await streamAgentReply({
      agentKey: agent,
      messages,
      context: { campaignName: campaign.name },
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
    return json(502, "The AI model is unavailable. Check that the model server is running.")
  }
}
