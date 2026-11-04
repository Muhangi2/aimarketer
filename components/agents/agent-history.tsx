"use client"

import { useState } from "react"
import { format, formatDistanceToNow } from "date-fns"
import { CalendarClock, ChevronDown, ClipboardList, KeyRound, Repeat } from "lucide-react"
import { cn } from "cn"
import { describeRepeat, formatWhen } from "@/lib/agents/schedule"
import type { AgentTaskRecord, ArtifactRecord, TaskRunRecord, TaskStatus } from "@/lib/agents/types"
import { TaskArtifacts } from "@/components/agents/task-artifacts"
import { TaskOutputs } from "@/components/agents/task-outputs"

const RUN_STATUS: Record<TaskRunRecord["status"], string> = {
  running: "Running",
  completed: "Done",
  failed: "Failed",
  needs_input: "Needed input",
}

export const TASK_STATUS: Record<TaskStatus, { label: string; className: string; dot: string }> = {
  pending: { label: "Scheduled", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" },
  queued: { label: "Starting…", className: "bg-brand/12 text-brand-deep dark:text-brand-glow", dot: "bg-brand animate-pulse" },
  in_progress: { label: "Working…", className: "bg-brand/12 text-brand-deep dark:text-brand-glow", dot: "bg-brand animate-pulse" },
  in_review: { label: "In review", className: "bg-brand/12 text-brand-deep dark:text-brand-glow", dot: "bg-brand animate-pulse" },
  needs_input: { label: "Needs your input", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  waiting_for_user: { label: "Waiting for you", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300", dot: "bg-amber-500 animate-pulse" },
  completed: { label: "Done", className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  blocked: { label: "Skipped", className: "bg-destructive/10 text-destructive", dot: "bg-destructive/60" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/40" },
  expired: { label: "Expired", className: "bg-destructive/10 text-destructive", dot: "bg-destructive/60" },
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", TASK_STATUS[status].className)}>
      {TASK_STATUS[status].label}
    </span>
  )
}

/** A task with its instructions and delivered work, expandable. */
export function TaskItem({
  task,
  runs = [],
  artifacts = [],
  prefix,
  onHelp,
  campaignId,
}: {
  task: AgentTaskRecord
  // Shows the findings and drafts saved for research and creator tasks
  campaignId?: string
  // Past runs, for repeating tasks
  runs?: TaskRunRecord[]
  // Files and links the agent made for this task
  artifacts?: ArtifactRecord[]
  prefix?: React.ReactNode
  // Opens the agent's computer when the task is waiting for the user
  onHelp?: () => void
}) {
  const made = artifacts.filter((a) => a.kind === "image" || a.kind === "file").length
  const upcoming = task.status === "pending" || task.status === "queued"
  // Saved outputs load the first time the task is opened
  const [opened, setOpened] = useState(false)
  const savesOutputs = campaignId && (task.agentKey === "research" || task.agentKey === "creator") && !upcoming
  return (
    <li className="rounded-xl border bg-background">
      <details className="group" onToggle={(e) => e.currentTarget.open && setOpened(true)}>
        <summary className="flex cursor-pointer list-none items-start gap-3 p-3.5 [&::-webkit-details-marker]:hidden">
          {prefix ?? <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TASK_STATUS[task.status].dot)} />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{task.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground" suppressHydrationWarning>
              {upcoming ? (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3" />
                  {task.runCount > 0 ? "Next run" : "Runs"} {formatWhen(task.scheduledAt)}
                </span>
              ) : (
                <span>{formatDistanceToNow(task.updatedAt || task.createdAt, { addSuffix: true })}</span>
              )}
              {task.repeatRule && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-medium text-brand-deep dark:text-brand-glow">
                  <Repeat className="size-2.5" /> {describeRepeat(task.repeatRule)}
                  {task.runCount > 0 && ` · ran ${task.runCount}×`}
                </span>
              )}
              {task.attempts > 1 && <span>{task.attempts} attempts</span>}
              {made > 0 && <span>{made === 1 ? "1 file" : `${made} files`}</span>}
            </p>
            {task.status === "waiting_for_user" && task.waitingReason && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <KeyRound className="size-3 shrink-0" />
                <span className="line-clamp-2">{task.waitingReason}</span>
                {onHelp && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      onHelp()
                    }}
                    className="shrink-0 rounded-md bg-amber-500/20 px-1.5 py-0.5 font-semibold hover:bg-amber-500/30"
                  >
                    Login now
                  </button>
                )}
              </p>
            )}
          </div>
          <TaskStatusBadge status={task.status} />
          <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t px-3.5 py-3 text-xs leading-relaxed">
          <div>
            <p className="font-semibold text-muted-foreground">Instructions</p>
            <p className="mt-1 whitespace-pre-line">{task.instructions}</p>
          </div>
          {task.output && (
            <div>
              <p className="font-semibold text-muted-foreground">Delivered work</p>
              <p className="mt-1 whitespace-pre-line">{task.output}</p>
            </div>
          )}
          <TaskArtifacts artifacts={artifacts} />
          {savesOutputs && opened && (
            <TaskOutputs campaignId={campaignId} taskId={task.id} agentKey={task.agentKey as "research" | "creator"} version={task.updatedAt} />
          )}
          {task.reviewFeedback && (
            <div>
              <p className="font-semibold text-muted-foreground">Master Agent review</p>
              <p className="mt-1 whitespace-pre-line">{task.reviewFeedback}</p>
            </div>
          )}
          {runs.length > 0 && (
            <div>
              <p className="font-semibold text-muted-foreground">Past runs</p>
              <ul className="mt-1 space-y-1">
                {runs.slice(0, 5).map((run) => (
                  <li key={run.id} className="flex items-center justify-between gap-3" suppressHydrationWarning>
                    <span>{format(run.scheduledFor, "EEE, MMM d · h:mm a")}</span>
                    <span className={cn(run.status === "failed" && "text-destructive")}>{RUN_STATUS[run.status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {task.error && <p className="text-destructive">{task.error}</p>}
        </div>
      </details>
    </li>
  )
}

/** Tasks the Master Agent assigned to one regular agent, newest first. */
export function AgentHistory({
  tasks,
  runs = [],
  artifacts = [],
  agentName,
  onHelp,
  campaignId,
}: {
  tasks: AgentTaskRecord[]
  campaignId?: string
  runs?: TaskRunRecord[]
  artifacts?: ArtifactRecord[]
  agentName: string
  onHelp?: () => void
}) {
  if (tasks.length === 0) {
    return (
      <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center animate-in fade-in duration-300">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand/12 text-brand ring-8 ring-muted/60 dark:text-brand-glow">
          <ClipboardList className="size-6" />
        </span>
        <p className="mt-6 text-sm font-semibold">No tasks yet</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Tasks the Master Agent assigns to the {agentName} will appear here with their status and results.
        </p>
      </div>
    )
  }

  return (
    <ol className="flex flex-col gap-2 py-4 animate-in fade-in duration-300">
      {[...tasks]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            runs={runs.filter((r) => r.taskId === task.id)}
            artifacts={artifacts.filter((a) => a.taskId === task.id)}
            onHelp={onHelp}
            campaignId={campaignId}
          />
        ))}
    </ol>
  )
}
