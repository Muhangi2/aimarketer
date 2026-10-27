"use client"

import { ArrowRight, Sparkles } from "lucide-react"
import { cn } from "cn"
import { AGENT_KEYS, MASTER_KEY, MASTER_ROLE } from "@/lib/agent-roles"
import type { AgentWorkspaceState } from "@/hooks/use-agent-workspace"
import { AgentAvatar } from "@/components/agents/agent-avatar"
import { AgentStatusBadge, MasterAvatar } from "@/components/agents/participant-avatar"

/**
 * The Master Agent's highlighted card: what it is coordinating right now and the team it leads.
 * `compact` hides the team row, for pages that already list the agents (the Agent page).
 */
export function MasterAgentCard({
  workspace,
  active = false,
  compact = false,
  className,
}: {
  workspace: AgentWorkspaceState
  active?: boolean
  compact?: boolean
  className?: string
}) {
  const status = workspace.states[MASTER_KEY]
  const open = workspace.requests.find((r) => ["running", "planning", "awaiting_clarification", "waiting"].includes(r.status))
  const openTasks = open ? workspace.tasks.filter((t) => t.requestId === open.id) : []
  const done = openTasks.filter((t) => t.status === "completed").length

  const headline = !open
    ? "Ready for your next request"
    : open.status === "awaiting_clarification"
      ? "Waiting for your answer"
      : open.status === "waiting"
        ? "Work on hold: an agent is paused"
        : openTasks.length
          ? `Coordinating ${done} of ${openTasks.length} tasks`
          : "Planning your request"

  return (
    <div
      className={cn(
        "group/card relative w-full overflow-hidden rounded-2xl p-[1px] transition-shadow duration-300",
        "bg-gradient-to-r from-violet-500/60 via-fuchsia-500/50 to-amber-400/60",
        active ? "shadow-lg shadow-violet-500/20" : "hover:shadow-lg hover:shadow-violet-500/15",
        className
      )}
    >
      <div className={cn("rounded-[15px]", active ? "bg-accent/95" : "bg-card/95")}>
        <button
          type="button"
          role={compact ? "tab" : undefined}
          aria-selected={compact ? active : undefined}
          onClick={() => workspace.select(MASTER_KEY)}
          className="group flex w-full flex-wrap items-center gap-4 rounded-[15px] p-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:flex-nowrap"
        >
          <MasterAvatar className="size-14" />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold tracking-tight">{MASTER_ROLE.name}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/12 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                <Sparkles className="size-3" /> Coordinator
              </span>
              <AgentStatusBadge status={status} />
            </span>
            <span className="mt-1 block text-[13px] text-muted-foreground">{headline}</span>
            {open && openTasks.length > 0 && (
              <span className="mt-2 block h-1 max-w-56 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${(done / openTasks.length) * 100}%` }}
                />
              </span>
            )}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm shadow-primary/30 transition-transform group-hover:translate-x-0.5">
            {active ? "Chatting" : "Open chat"} <ArrowRight className="size-3.5" />
          </span>
        </button>

        {/* The team the Master Agent leads: each agent opens its own chat */}
        {!compact && (
          <div className="border-t border-violet-500/15 px-4 pt-3 pb-4">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Your team</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AGENT_KEYS.map((key) => {
                const seat = workspace.seatFor(key)
                if (!seat) return null
                const agentStatus = workspace.states[key]
                const current = workspace.tasks.find(
                  (t) => t.agentKey === key && (t.status === "in_progress" || t.status === "in_review")
                )
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => workspace.select(key)}
                    className="flex min-w-0 items-center gap-2.5 rounded-xl border bg-background/70 p-2 pr-3 text-left transition-all duration-200 outline-none hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <AgentAvatar seat={seat} className={cn("size-10", agentStatus === "paused" && "opacity-60 grayscale")} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] leading-tight font-semibold">{seat.role.name}</span>
                        <span className="text-sm leading-none">{seat.role.emoji}</span>
                      </span>
                      <span className="mt-1 flex min-w-0 items-center gap-1.5">
                        <AgentStatusBadge status={agentStatus} className="shrink-0" />
                        <span className="truncate text-[11px] text-muted-foreground">{current?.title ?? seat.role.task}</span>
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
