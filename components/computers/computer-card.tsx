"use client"

import { useState } from "react"
import { Hand, KeyRound, Maximize2, MousePointer2, Pause, Play } from "lucide-react"
import { cn } from "cn"
import { AGENT_ROLES, type ComputerAgentKey } from "@/lib/agent-roles"
import type { AgentWorkspaceState, ComputerAction } from "@/hooks/use-agent-workspace"
import { ComputerScreen } from "@/components/computers/computer-screen"
import { LiveActivity, LiveStatusBadge } from "@/components/agents/live-status-badge"
import { TaskArtifacts } from "@/components/agents/task-artifacts"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** Runs a computer action with a pending state and a readable error. */
export function useComputerActions(workspace: AgentWorkspaceState, agentKey: ComputerAgentKey) {
  const [pending, setPending] = useState<ComputerAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function act(action: ComputerAction, then?: () => void) {
    setPending(action)
    setError(null)
    try {
      await workspace.computerAction(agentKey, action)
      then?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setPending(null)
    }
  }
  return { pending, error, act }
}

/**
 * One agent's computer: live preview, what it's doing, and controls (open large, take over /
 * hand back, pause / start). `compact` is the Master Agent's side-by-side grid.
 */
export function ComputerCard({
  workspace,
  agentKey,
  compact = false,
  className,
}: {
  workspace: AgentWorkspaceState
  agentKey: ComputerAgentKey
  compact?: boolean
  className?: string
}) {
  const role = AGENT_ROLES.find((r) => r.key === agentKey)!
  const computer = workspace.computerFor(agentKey)
  const status = workspace.statusFor(agentKey)
  const { pending, error, act } = useComputerActions(workspace, agentKey)
  const ended = workspace.campaignStatus !== "active"
  const inControl = computer?.control === "user"
  const running = computer?.status === "running"
  const waitingTask = status.task?.status === "waiting_for_user" ? status.task : null
  const agentBusy = !inControl && (status.key === "running")
  const files = workspace.artifacts.filter((a) => a.agentKey === agentKey && (a.kind === "image" || a.kind === "file")).slice(0, 12)

  const busyIcon = (action: ComputerAction, Icon: typeof Play) => (pending === action ? <Spinner /> : <Icon />)

  return (
    <section className={cn("flex min-w-0 flex-col gap-3", className)}>
      <header className="flex items-start gap-3">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg text-base", role.tone)}>{role.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">{compact ? role.name : `${role.name}'s computer`}</h4>
            <LiveStatusBadge status={status} />
          </div>
          <LiveActivity status={status} fallback={running ? "Computer is on" : undefined} className="mt-0.5" />
        </div>
      </header>

      {waitingTask && !inControl && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
          <KeyRound className="size-4 shrink-0" />
          <p className="min-w-0 flex-1">{waitingTask.waitingReason ?? "The agent needs your help on its computer."}</p>
          <Button size="sm" className="h-8 rounded-lg" disabled={pending !== null || ended} onClick={() => act("take_over", () => workspace.openViewer(agentKey))}>
            {busyIcon("take_over", KeyRound)} Login now
          </Button>
        </div>
      )}

      <button
        type="button"
        onClick={() => workspace.openViewer(agentKey)}
        className="group relative block w-full rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`Open the ${role.name}'s computer`}
      >
        <ComputerScreen campaignId={workspace.campaignId} agentKey={agentKey} computer={computer} />
        <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 opacity-0 transition-all group-hover:bg-black/25 group-hover:opacity-100">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-900 shadow">
            <Maximize2 className="size-3.5" /> Open large
          </span>
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => workspace.openViewer(agentKey)}>
          <Maximize2 /> {compact ? "Open" : "Open large"}
        </Button>
        {inControl ? (
          <Button size="sm" className="h-8 rounded-lg" disabled={pending !== null || ended} onClick={() => act("hand_back")}>
            {busyIcon("hand_back", Hand)} {waitingTask ? "Done" : "Hand back"}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg"
            disabled={pending !== null || ended}
            onClick={() => act("take_over", () => workspace.openViewer(agentKey))}
          >
            {busyIcon("take_over", MousePointer2)} Take over
          </Button>
        )}
        {running ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-lg"
            disabled={pending !== null || ended || agentBusy}
            title={agentBusy ? "The agent is using its computer" : undefined}
            onClick={() => act("pause")}
          >
            {busyIcon("pause", Pause)} Pause
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-8 rounded-lg" disabled={pending !== null || ended || computer?.status === "starting"} onClick={() => act("start")}>
            {busyIcon("start", Play)} Start
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {!compact && (
        <div className="rounded-xl border bg-muted/30 p-3 text-xs">
          {files.length > 0 ? (
            <TaskArtifacts artifacts={files} />
          ) : (
            <p className="text-muted-foreground">
              Files the {role.name} makes ({agentKey === "creator" ? "images, drafts and edits" : "notes, screenshots and exports"}) appear here with permanent links.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
