"use client"

import { formatDistanceToNow } from "date-fns"
import { ChevronDown, ClipboardList } from "lucide-react"
import { cn } from "cn"
import type { AgentTaskRecord, TaskStatus } from "@/lib/agents/types"

export const TASK_STATUS: Record<TaskStatus, { label: string; className: string; dot: string }> = {
  pending: { label: "Queued", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/50" },
  in_progress: { label: "Working…", className: "bg-blue-500/12 text-blue-700 dark:text-blue-300", dot: "bg-blue-500 animate-pulse" },
  in_review: { label: "In review", className: "bg-violet-500/12 text-violet-700 dark:text-violet-300", dot: "bg-violet-500 animate-pulse" },
  needs_input: { label: "Needs your input", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  completed: { label: "Done", className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
  blocked: { label: "Skipped", className: "bg-destructive/10 text-destructive", dot: "bg-destructive/60" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/40" },
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", TASK_STATUS[status].className)}>
      {TASK_STATUS[status].label}
    </span>
  )
}

/** A task with its instructions and delivered work, expandable. */
export function TaskItem({ task, prefix }: { task: AgentTaskRecord; prefix?: React.ReactNode }) {
  return (
    <li className="rounded-xl border bg-background">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 p-3.5 [&::-webkit-details-marker]:hidden">
          {prefix ?? <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TASK_STATUS[task.status].dot)} />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{task.title}</p>
            <p className="mt-1 text-xs text-muted-foreground" suppressHydrationWarning>
              {formatDistanceToNow(task.updatedAt || task.createdAt, { addSuffix: true })}
              {task.attempts > 1 && ` · ${task.attempts} attempts`}
            </p>
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
          {task.reviewFeedback && (
            <div>
              <p className="font-semibold text-muted-foreground">Master Agent review</p>
              <p className="mt-1 whitespace-pre-line">{task.reviewFeedback}</p>
            </div>
          )}
          {task.error && <p className="text-destructive">{task.error}</p>}
        </div>
      </details>
    </li>
  )
}

/** Tasks the Master Agent assigned to one regular agent, newest first. */
export function AgentHistory({ tasks, agentName }: { tasks: AgentTaskRecord[]; agentName: string }) {
  if (tasks.length === 0) {
    return (
      <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center animate-in fade-in duration-300">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-600 ring-8 ring-muted/60 dark:text-violet-400">
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
          <TaskItem key={task.id} task={task} />
        ))}
    </ol>
  )
}
