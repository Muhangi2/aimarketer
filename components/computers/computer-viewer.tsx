"use client"

import { useEffect, useState } from "react"
import { Hand, KeyRound, MousePointer2, Play, ShieldCheck } from "lucide-react"
import { AGENT_ROLES, type ComputerAgentKey } from "@/lib/agent-roles"
import type { AgentWorkspaceState } from "@/hooks/use-agent-workspace"
import { useComputerActions } from "@/components/computers/computer-card"
import { ComputerScreen } from "@/components/computers/computer-screen"
import { LiveActivity, LiveStatusBadge } from "@/components/agents/live-status-badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"

// While the user has control, keep the desktop awake with a ping this often
const HEARTBEAT_MS = 30_000

/** The large live viewer: watch, take over, and the "Login now" / "Done" flow. */
export function ComputerViewer({ workspace }: { workspace: AgentWorkspaceState }) {
  const agentKey = workspace.viewerKey
  return (
    <Dialog open={agentKey !== null} onOpenChange={(open) => !open && workspace.closeViewer()}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] w-[min(1100px,calc(100vw-2rem))] max-w-none flex-col gap-3 overflow-y-auto p-4 sm:max-w-none sm:p-5">
        {agentKey && <ViewerBody key={agentKey} workspace={workspace} agentKey={agentKey} />}
      </DialogContent>
    </Dialog>
  )
}

function ViewerBody({ workspace, agentKey }: { workspace: AgentWorkspaceState; agentKey: ComputerAgentKey }) {
  const role = AGENT_ROLES.find((r) => r.key === agentKey)!
  const computer = workspace.computerFor(agentKey)
  const status = workspace.statusFor(agentKey)
  const { pending, error, act } = useComputerActions(workspace, agentKey)
  const running = computer?.status === "running"
  const inControl = computer?.control === "user"
  const waitingTask = status.task?.status === "waiting_for_user" ? status.task : null
  const ended = workspace.campaignStatus !== "active"
  const [stream, setStream] = useState<{ url: string; interactive: boolean } | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)

  // The stream link is fetched fresh each time (view-only unless the user has control), never stored
  useEffect(() => {
    setStream(null)
    setStreamError(null)
    if (!running) return
    const controller = new AbortController()
    fetch(`/api/computers/${agentKey}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: workspace.campaignId }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? "Couldn't open the live view.")
        setStream(body)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setStreamError(e instanceof Error ? e.message : "Couldn't open the live view.")
      })
    return () => controller.abort()
  }, [agentKey, running, inControl, workspace.campaignId])

  useEffect(() => {
    if (!inControl || !running) return
    const timer = window.setInterval(() => {
      void workspace.computerAction(agentKey, "heartbeat").catch(() => undefined)
    }, HEARTBEAT_MS)
    return () => window.clearInterval(timer)
    // computerAction is stable for this campaign
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inControl, running, agentKey])

  return (
    <>
      <div className="flex flex-wrap items-start gap-3 pr-8">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-lg ${role.tone}`}>{role.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-base">{role.name}&apos;s computer</DialogTitle>
            <LiveStatusBadge status={status} />
          </div>
          <DialogDescription render={<div />} className="mt-0.5">
            <LiveActivity status={status} fallback={inControl ? "You're in control: the agent waits until you hand back." : running ? "Watching live" : "The computer is paused"} />
          </DialogDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!running && !ended && (
            <Button variant="outline" className="h-9 rounded-xl" disabled={pending !== null || computer?.status === "starting"} onClick={() => act("start")}>
              {pending === "start" ? <Spinner /> : <Play />} Start
            </Button>
          )}
          {inControl ? (
            <Button className="h-9 rounded-xl" disabled={pending !== null || ended} onClick={() => act("hand_back")}>
              {pending === "hand_back" ? <Spinner /> : <Hand />} {waitingTask ? "Done" : "Hand back"}
            </Button>
          ) : waitingTask ? (
            <Button className="h-9 rounded-xl" disabled={pending !== null || ended} onClick={() => act("take_over")}>
              {pending === "take_over" ? <Spinner /> : <KeyRound />} Login now
            </Button>
          ) : (
            <Button variant="outline" className="h-9 rounded-xl" disabled={pending !== null || ended} onClick={() => act("take_over")}>
              {pending === "take_over" ? <Spinner /> : <MousePointer2 />} Take over
            </Button>
          )}
        </div>
      </div>

      {waitingTask && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-100">
          <KeyRound className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{waitingTask.waitingReason ?? "The agent needs your help."}</p>
            <p className="mt-0.5 opacity-80">
              {inControl
                ? `Log in or finish the check on the screen below, then click "Done". The agent continues from where it stopped.`
                : `Click "Login now" to take control of the computer.`}
            </p>
          </div>
        </div>
      )}
      {inControl && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3.5 text-emerald-600" /> What you type goes straight to the computer. The agent never sees or stores your passwords.
        </p>
      )}

      {running && stream ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border bg-slate-950">
          <iframe
            key={stream.url}
            src={stream.url}
            title={`${role.name}'s computer`}
            className="size-full"
            allow="clipboard-read; clipboard-write"
            referrerPolicy="no-referrer"
          />
          {!stream.interactive && (
            <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
              View only · Take over to use it
            </span>
          )}
        </div>
      ) : (
        <ComputerScreen campaignId={workspace.campaignId} agentKey={agentKey} computer={computer} />
      )}
      {(error || streamError) && <p className="text-xs text-destructive">{error ?? streamError}</p>}
    </>
  )
}
