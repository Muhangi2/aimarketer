import { z } from "zod"
import { jsonError } from "@/lib/agents/route-auth"
import { DesktopError, connectDesktop, openDesktop, pauseDesktop } from "@/lib/computers/desktop"
import { authorizeComputer } from "@/lib/computers/route-auth"
import { inngest } from "@/lib/inngest/client"

const bodySchema = z.object({
  campaignId: z.string().uuid(),
  // take_over: the user gets control (also "Login now"); hand_back: the agent continues (also "Done")
  action: z.enum(["take_over", "hand_back", "start", "pause", "heartbeat"]),
})

// While the user has control, the viewer pings this often; the desktop stays awake meanwhile
const KEEP_AWAKE_MS = 60_000

/** Take over / hand back, start / pause, and keep-awake pings for an agent's computer. */
export async function POST(request: Request, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, "Invalid request")
  const { campaignId, action } = parsed.data

  const auth = await authorizeComputer(agent, campaignId)
  if ("error" in auth) return auth.error
  const { computers, agentKey, store } = auth

  try {
    if ((await store.getCampaignStatus()) !== "active") return jsonError(409, "This campaign has ended.")
    const computer = await computers.ensure(agentKey)
    if (computer.status === "shut_down") return jsonError(409, "This computer has been shut down.")

    switch (action) {
      case "take_over": {
        // Running agents stop before their next action and wait for the hand back
        await computers.update(agentKey, { control: "user", lastActiveAt: Date.now(), activity: "You're in control" })
        if (computer.status !== "running") await openDesktop(computers, agentKey)
        break
      }
      case "hand_back": {
        await computers.update(agentKey, { control: "agent", lastActiveAt: Date.now(), activity: computer.currentTaskId ? "Getting back to work" : null })
        if (computer.currentTaskId) {
          const resumed = await store.resumeWaitingTask(computer.currentTaskId)
          // The task's background run wakes up right away (it also re-checks on its own)
          await inngest.send({ name: "computer/resume", data: { taskId: computer.currentTaskId, campaignId } }).catch((error) => {
            console.error("Could not wake the agent; it will notice within 30 minutes", error)
          })
          if (resumed) await store.setActivity(agentKey, "Getting back to work").catch(() => undefined)
        }
        break
      }
      case "start":
        if (computer.status !== "running") await openDesktop(computers, agentKey)
        await computers.touch(agentKey)
        break
      case "pause": {
        const task = computer.currentTaskId ? await store.getTask(computer.currentTaskId) : null
        const busy = computer.control === "agent" && (task?.status === "in_progress" || task?.status === "in_review")
        if (busy) return jsonError(409, "The agent is working on this computer. Take over first, or wait until it's done.")
        if (computer.status === "running") await pauseDesktop(computers, computer)
        break
      }
      case "heartbeat":
        if (computer.control === "user" && computer.status === "running") {
          if (Date.now() - computer.lastActiveAt > KEEP_AWAKE_MS / 2 && computer.sandboxId) {
            await connectDesktop(computer.sandboxId) // extends the desktop's own timeout
          }
          await computers.touch(agentKey)
        }
        break
    }
    const updated = await computers.get(agentKey)
    return Response.json({ computer: updated && { ...updated, campaignId: undefined, userId: undefined, sandboxId: undefined } })
  } catch (error) {
    console.error(`Computer ${action} failed for ${agent}`, error)
    return jsonError(500, error instanceof DesktopError ? error.message : "Couldn't update the computer. Please try again.")
  }
}
