import { z } from "zod"
import { jsonError } from "@/lib/agents/route-auth"
import { connectDesktop, streamUrl } from "@/lib/computers/desktop"
import { authorizeComputer } from "@/lib/computers/route-auth"

const bodySchema = z.object({ campaignId: z.string().uuid() })

/**
 * The live desktop stream for the large viewer. Only the campaign owner gets it, only while the
 * desktop runs, and it is interactive only while they have taken control. Never cached or stored.
 */
export async function POST(request: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, "Invalid request")

  const auth = await authorizeComputer(agent, parsed.data.campaignId)
  if ("error" in auth) return auth.error

  try {
    const computer = await auth.computers.get(auth.agentKey)
    if (!computer?.sandboxId || computer.status !== "running") return jsonError(409, "The computer isn't running.")
    const { streamKey } = await auth.computers.getSecret(auth.agentKey)
    if (!streamKey) return jsonError(409, "The computer's stream isn't ready yet.")
    const sandbox = await connectDesktop(computer.sandboxId)
    const interactive = computer.control === "user"
    return Response.json({ url: streamUrl(sandbox, streamKey, !interactive), interactive }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error(`Could not open the ${agent} stream`, error)
    return jsonError(500, "Couldn't open the computer's stream.")
  }
}
