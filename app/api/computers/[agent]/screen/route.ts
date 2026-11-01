import { z } from "zod"
import { jsonError } from "@/lib/agents/route-auth"
import { connectDesktop } from "@/lib/computers/desktop"
import { authorizeComputer } from "@/lib/computers/route-auth"

const querySchema = z.object({ campaignId: z.string().uuid() })

// Previews poll every few seconds; one screenshot per desktop serves them all for a moment
const CACHE_MS = 2000
const cache = new Map<string, { at: number; png: Uint8Array }>()

const png = (bytes: Uint8Array, live: boolean) =>
  new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Screen": live ? "live" : "saved" },
  })

/**
 * The agent's screen as a PNG: live while the desktop runs, otherwise the screenshot saved when
 * it was paused. Lets the UI show computers without ever sending the stream password.
 */
export async function GET(request: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return jsonError(400, "Invalid request")

  const auth = await authorizeComputer(agent, parsed.data.campaignId)
  if ("error" in auth) return auth.error

  try {
    const computer = await auth.computers.get(auth.agentKey)
    if (computer?.status === "running" && computer.sandboxId) {
      const cached = cache.get(computer.sandboxId)
      if (cached && Date.now() - cached.at < CACHE_MS) return png(cached.png, true)
      try {
        const sandbox = await connectDesktop(computer.sandboxId)
        const shot = await sandbox.screenshot()
        cache.set(computer.sandboxId, { at: Date.now(), png: shot })
        return png(shot, true)
      } catch (error) {
        console.error(`Live screenshot of the ${agent} computer failed`, error)
      }
    }
    const { screenshot } = await auth.computers.getSecret(auth.agentKey)
    if (!screenshot) return jsonError(404, "No screenshot yet")
    return png(Buffer.from(screenshot, "base64"), false)
  } catch (error) {
    console.error(`Could not load the ${agent} screen`, error)
    return jsonError(500, "Couldn't load the screen.")
  }
}
