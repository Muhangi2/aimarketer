import { isComputerAgent, type AgentKey } from "@/lib/agent-roles"
import type { AgentActivities, AgentStates, AgentTaskRecord, CampaignStatus, ComputerRecord } from "@/lib/agents/types"

// Shared by the agent list, the office and the computer views (browser and server)

export type LiveStatusKey = "running" | "scheduled" | "waiting" | "in_control" | "paused" | "done" | "skipped" | "failed" | "idle" | "ended"

export type LiveStatus = {
  key: LiveStatusKey
  label: string
  // What the agent is doing right now, e.g. "Opening instagram.com"
  activity: string | null
  // The task it's on (or last finished)
  task: AgentTaskRecord | null
}

export const LIVE_STATUS_STYLE: Record<LiveStatusKey, { badge: string; dot: string }> = {
  running: { badge: "bg-blue-500/12 text-blue-700 dark:text-blue-300", dot: "bg-blue-500 animate-pulse" },
  scheduled: { badge: "bg-sky-500/12 text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  waiting: { badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300", dot: "bg-amber-500 animate-pulse" },
  in_control: { badge: "bg-violet-500/12 text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  paused: { badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  done: { badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  skipped: { badge: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
  failed: { badge: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  idle: { badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  ended: { badge: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" },
}

// "Done" / "Failed" stay up this long after the task finished, then the agent shows as ready
const RECENT_MS = 30 * 60 * 1000

export function liveStatus({
  agentKey,
  states,
  activities,
  tasks,
  computer,
  campaignStatus,
  now = Date.now(),
}: {
  agentKey: AgentKey
  states: AgentStates
  activities: AgentActivities
  tasks: AgentTaskRecord[]
  computer?: ComputerRecord | null
  campaignStatus: CampaignStatus
  now?: number
}): LiveStatus {
  const own = tasks.filter((t) => t.agentKey === agentKey).sort((a, b) => b.updatedAt - a.updatedAt)
  const activity = activities[agentKey] ?? computer?.activity ?? null
  if (campaignStatus !== "active") return { key: "ended", label: campaignStatus === "ending" ? "Shutting down" : "Campaign ended", activity: null, task: null }

  const waiting = own.find((t) => t.status === "waiting_for_user")
  if (computer?.control === "user") return { key: "in_control", label: "You're in control", activity: waiting?.waitingReason ?? null, task: waiting ?? null }
  if (waiting) return { key: "waiting", label: "Waiting for you", activity: waiting.waitingReason, task: waiting }

  if (states[agentKey] === "paused") return { key: "paused", label: "Paused", activity: null, task: null }

  const active = own.find((t) => t.status === "in_progress" || t.status === "in_review" || t.status === "queued")
  // Tasks are queued up to ~15 minutes ahead: until its start time it's only scheduled
  if (active?.status === "queued" && active.scheduledAt - now > 30_000) {
    const minutes = Math.ceil((active.scheduledAt - now) / 60_000)
    return { key: "scheduled", label: "Scheduled", activity: `Starts "${active.title}" in ${minutes} min`, task: active }
  }
  if (active) {
    const fallback = active.status === "in_review" ? "Master Agent is reviewing the work" : active.status === "queued" ? "Starting" : `Working on "${active.title}"`
    return { key: "running", label: active.status === "in_review" ? "In review" : "Running", activity: activity ?? fallback, task: active }
  }

  const needsAnswer = own.find((t) => t.status === "needs_input")
  if (needsAnswer) return { key: "waiting", label: "Waiting for you", activity: "Needs an answer in the Master Agent chat", task: needsAnswer }

  const last = own.find((t) => ["completed", "failed", "expired", "blocked"].includes(t.status) || (t.repeatRule && t.lastRunAt))
  if (last && now - last.updatedAt < RECENT_MS) {
    // Skipped because a task it depended on didn't finish: nothing went wrong in this agent
    if (last.status === "blocked") return { key: "skipped", label: "Skipped", activity: last.error, task: last }
    if (last.status === "failed" || last.status === "expired") {
      return { key: "failed", label: last.status === "expired" ? "Expired" : "Failed", activity: last.error, task: last }
    }
    return { key: "done", label: "Done", activity: `Finished "${last.title}"`, task: last }
  }
  if (states[agentKey] === "error") return { key: "failed", label: "Failed", activity: null, task: null }

  const computerNote = isComputerAgent(agentKey) && computer?.status === "running" ? "Computer is on" : null
  return { key: "idle", label: "Ready", activity: computerNote, task: null }
}
