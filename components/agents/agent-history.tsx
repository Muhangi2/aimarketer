import { formatDistanceToNow } from "date-fns"
import { ClipboardList } from "lucide-react"
import { cn } from "cn"

export type AgentTask = {
  id: string
  text: string
  status: "working" | "done" | "failed" | "waiting"
  at: number
}

const STATUS: Record<AgentTask["status"], { label: string; className: string }> = {
  working: { label: "Working…", className: "bg-blue-500/12 text-blue-700 dark:text-blue-300" },
  done: { label: "Answered", className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  waiting: { label: "Waiting · agent paused", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
}

export function AgentHistory({ tasks, agentName }: { tasks: AgentTask[]; agentName: string }) {
  if (tasks.length === 0) {
    return (
      <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center animate-in fade-in duration-300">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-600 ring-8 ring-muted/60 dark:text-violet-400">
          <ClipboardList className="size-6" />
        </span>
        <p className="mt-6 text-sm font-semibold">No tasks yet</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Tasks you give the {agentName} in Chat will appear here with their status.
        </p>
      </div>
    )
  }

  return (
    <ol className="flex flex-col gap-2 py-4 animate-in fade-in duration-300">
      {[...tasks].reverse().map((task) => (
        <li key={task.id} className="flex items-start gap-3 rounded-xl border bg-background p-3.5">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">{task.text}</p>
            <p className="mt-1 text-xs text-muted-foreground">{formatDistanceToNow(task.at, { addSuffix: true })}</p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS[task.status].className)}>
            {STATUS[task.status].label}
          </span>
        </li>
      ))}
    </ol>
  )
}
