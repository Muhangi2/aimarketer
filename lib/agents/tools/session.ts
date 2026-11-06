import "server-only"
import type { Sandbox } from "@e2b/desktop"
import type { ComputerAgentKey } from "@/lib/agent-roles"
import type { OutputStore } from "@/lib/agents/outputs"
import type { AgentStore } from "@/lib/agents/store"
import type { AgentTaskRecord } from "@/lib/agents/types"
import { openDesktop, screenshotBase64 } from "@/lib/computers/desktop"
import type { ComputerStore } from "@/lib/computers/store"

/*
 * What every agent tool shares: the task's session (desktop, stores, pause state), the run's
 * memory (kept between slices) and small helpers the tools call.
 */

// Computer actions per agent attempt, so a confused agent can't loop forever
export const MAX_ACTIONS = 60
// Screenshots sent to the model. The local vision model (COMPUTER_MODEL, ~16k context) only gets the latest
const SCREENSHOTS_KEPT = 1
const CONTROL_CHECK_MS = 2000

export type PauseReason = "timeslice" | "takeover" | "needs_user"
export type HelpRequest = { reason: string; url: string | null }

// Kept in the RunState, so it survives between slices: keep it small and JSON-only
export type RunMemory = {
  actions: number
  uploads: Record<string, string>
  // Opened a web page this attempt (so findings can be marked as checked live)
  browsed?: boolean
  findings?: string[]
  drafts?: string[]
  // Permanent URLs of images made or uploaded this attempt, so a forgotten draft still gets them
  images?: string[]
  // Permanent URLs of videos made this attempt (make_video)
  videos?: string[]
}

export const newMemory = (): RunMemory => ({ actions: 0, uploads: {}, browsed: false, findings: [], drafts: [], images: [], videos: [] })

export type Session = {
  // Started on first use: work from the agent's own knowledge never boots a desktop
  sandbox: Sandbox | null
  computers: ComputerStore
  agents: AgentStore
  outputs: OutputStore
  agentKey: ComputerAgentKey
  campaignName: string
  task: AgentTaskRecord
  deadline: number
  // Base64 PNGs, newest last. Only sent to the model, never saved in the run
  screenshots: string[]
  pause: { reason: PauseReason; help: HelpRequest | null } | null
  control: { checkedAt: number; user: boolean }
  // Whether this task gets the browser tools (see toolPlan)
  browse: boolean
}

/** The run's memory from a tool's context. */
export const memoryOf = (ctx: { context: unknown } | undefined) => (ctx?.context ?? newMemory()) as RunMemory

export const OUT_OF_ACTIONS = "You have used all your computer actions for this task. Stop using the computer and call finish_task now with what you have."

/** Counts one web or computer action against the attempt's budget; true when it's used up. */
export const outOfActions = (memory: RunMemory) => ++memory.actions > MAX_ACTIONS

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

// Logs tool failures and tells the model what went wrong (bad input, a failed command), so it can fix the call
export function toolError(_ctx: unknown, error: unknown) {
  console.error("Computer agent tool failed", error)
  return `That did not work: ${errorText(error).slice(0, 400)}`
}

export async function setActivity(session: Session, activity: string) {
  await Promise.all([
    session.computers.touch(session.agentKey, activity),
    session.agents.setActivity(session.agentKey, activity),
  ]).catch((error) => console.error("Could not update the agent's activity", error))
}

/** The agent's desktop, started (or resumed) the first time a tool needs it. */
export async function desktop(session: Session) {
  if (!session.sandbox) {
    await setActivity(session, "Starting its computer")
    session.sandbox = await openDesktop(session.computers, session.agentKey)
  }
  return session.sandbox
}

// No desktop yet means nothing to show
export async function takeScreenshot(session: Session) {
  if (!session.sandbox) return
  const shot = await screenshotBase64(session.sandbox)
  session.screenshots = [...session.screenshots, shot].slice(-SCREENSHOTS_KEPT)
}

export const campaignFolder = (session: Session) => `/campaigns/${session.computers.campaignId}/${session.agentKey}`

// True while the owner has taken over the computer. Cached briefly: it's checked before every action
export async function userHasControl(session: Session) {
  if (Date.now() - session.control.checkedAt < CONTROL_CHECK_MS) return session.control.user
  const computer = await session.computers.get(session.agentKey)
  session.control = { checkedAt: Date.now(), user: computer?.control === "user" }
  return session.control.user
}

/** Saves the run before a tool starts if the user has control or the slice has expired. */
export function pauseGate(session: Session) {
  return async () => {
    if (await userHasControl(session)) {
      session.pause ??= { reason: "takeover", help: null }
      return true
    }
    if (Date.now() > session.deadline) {
      session.pause ??= { reason: "timeslice", help: null }
      return true
    }
    return false
  }
}
