"use client"

import { formatDistanceToNow } from "date-fns"
import { Workflow } from "lucide-react"
import { cn } from "cn"
import { isComputerAgent, participantName, type AgentKey, type ComputerAgentKey } from "@/lib/agent-roles"
import type { OfficeSeat } from "@/lib/office-scene"
import type { AgentRequestRecord, AgentTaskRecord, ArtifactRecord, RequestStatus, TaskRunRecord } from "@/lib/agents/types"
import { AgentAvatar } from "@/components/agents/agent-avatar"
import { TaskItem } from "@/components/agents/agent-history"

const REQUEST_STATUS: Record<RequestStatus, { label: string; className: string }> = {
  planning: { label: "Planning…", className: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  running: { label: "In progress", className: "bg-blue-500/12 text-blue-700 dark:text-blue-300" },
  awaiting_clarification: { label: "Needs your input", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  waiting: { label: "On hold", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  completed: { label: "Completed", className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
}

/** The Master Agent's requests, each with its task plan, assignments and progress. */
export function MasterTasks({
  requests,
  tasks,
  runs,
  artifacts = [],
  seatFor,
  onHelp,
}: {
  requests: AgentRequestRecord[]
  tasks: AgentTaskRecord[]
  runs: TaskRunRecord[]
  artifacts?: ArtifactRecord[]
  seatFor: (key: AgentKey) => OfficeSeat | null
  // Opens an agent's computer, for tasks waiting for the user
  onHelp?: (key: ComputerAgentKey) => void
}) {
  if (requests.length === 0) {
    return (
      <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center animate-in fade-in duration-300">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-600 ring-8 ring-muted/60 dark:text-violet-400">
          <Workflow className="size-6" />
        </span>
        <p className="mt-6 text-sm font-semibold">No requests yet</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Tell the Master Agent what you need in Chat. Its plan, the tasks it assigns and their progress will show up here.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 py-4 animate-in fade-in duration-300">
      {requests.map((request) => {
        const own = tasks.filter((t) => t.requestId === request.id).sort((a, b) => a.position - b.position)
        const byId = new Map(own.map((t) => [t.id, t]))
        const done = own.filter((t) => t.status === "completed").length
        const status = REQUEST_STATUS[request.status]
        return (
          <section key={request.id} className="rounded-2xl border bg-muted/30 p-4">
            <header className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold">{request.prompt}</p>
                <p className="mt-1 text-xs text-muted-foreground" suppressHydrationWarning>
                  {formatDistanceToNow(request.createdAt, { addSuffix: true })}
                  {own.length > 0 && ` · ${done} of ${own.length} tasks done`}
                </p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", status.className)}>{status.label}</span>
            </header>

            {own.length > 0 && (
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemax={own.length}>
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${(done / own.length) * 100}%` }}
                />
              </div>
            )}

            {request.status === "awaiting_clarification" && request.clarificationQuestion && (
              <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs whitespace-pre-line text-amber-800 dark:text-amber-200">
                {request.clarificationQuestion}
              </p>
            )}

            {own.length > 0 && (
              <ol className="mt-3 flex flex-col gap-2">
                {own.map((task) => {
                  const seat = seatFor(task.agentKey)
                  const after = task.dependsOn.map((id) => byId.get(id)?.title).filter(Boolean)
                  return (
                    <TaskItem
                      key={task.id}
                      task={{
                        ...task,
                        title: `${participantName(task.agentKey)}: ${task.title}`,
                        instructions: after.length ? `${task.instructions}\n\nStarts after: ${after.join(", ")}` : task.instructions,
                      }}
                      runs={runs.filter((r) => r.taskId === task.id)}
                      artifacts={artifacts.filter((a) => a.taskId === task.id)}
                      onHelp={onHelp && isComputerAgent(task.agentKey) ? () => onHelp(task.agentKey as ComputerAgentKey) : undefined}
                      prefix={seat ? <AgentAvatar seat={seat} className="size-7" /> : undefined}
                    />
                  )
                })}
              </ol>
            )}

            {request.error && request.status !== "completed" && (
              <p className="mt-3 text-xs text-destructive">{request.error}</p>
            )}
          </section>
        )
      })}
    </div>
  )
}
