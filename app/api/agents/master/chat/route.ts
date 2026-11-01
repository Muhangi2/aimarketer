import { masterChatRequestSchema } from "@/lib/ai/chat"
import { Orchestrator } from "@/lib/ai/orchestrator"
import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"
import { isValidTimeZone } from "@/lib/agents/schedule"
import type { OrchestratorEvent } from "@/lib/agents/types"

// Campaigns the Master Agent is working on in this server process; one request at a time each
const running = new Set<string>()

/**
 * Sends a message to the Master Agent and streams its turn (reply, question or scheduled plan) as
 * newline-delimited JSON events. The planned tasks then run in the background through Inngest.
 */
export async function POST(request: Request) {
  const parsed = masterChatRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, "Invalid chat request")
  const body = parsed.data

  const auth = await authorizeCampaign(body.campaignId)
  if ("error" in auth) return auth.error

  if ((await auth.store.getCampaignStatus().catch(() => "active")) !== "active") {
    return jsonError(409, "This campaign has ended. Start a new campaign to brief the team again.")
  }

  if (running.has(body.campaignId)) {
    return jsonError(409, "The Master Agent is still working on your last request. Please wait for it to finish.")
  }
  running.add(body.campaignId)

  const encoder = new TextEncoder()
  let closed = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: OrchestratorEvent) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // The browser went away; keep working and saving anyway
          closed = true
        }
      }
      const timeZone = body.timeZone && isValidTimeZone(body.timeZone) ? body.timeZone : "UTC"
      const orchestrator = new Orchestrator(auth.store, auth.campaignName, timeZone, emit)

      orchestrator
        .handleUserMessage(body.message)
        .catch((error: unknown) => {
          console.error("Master Agent crashed", error)
          emit({ type: "error", message: "The Master Agent stopped unexpectedly. Please try again." })
        })
        .finally(() => {
          running.delete(body.campaignId)
          emit({ type: "done" })
          if (!closed) {
            closed = true
            controller.close()
          }
        })
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  })
}
