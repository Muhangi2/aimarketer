import { Crown } from "lucide-react"
import { cn } from "cn"
import { MASTER_KEY } from "@/lib/agent-roles"
import type { OfficeSeat } from "@/lib/office-scene"
import type { AgentStatus, Participant } from "@/lib/agents/types"
import { AgentAvatar } from "@/components/agents/agent-avatar"

export function MasterAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand via-brand to-brand text-white shadow-md shadow-brand/30 ring-2 ring-white dark:ring-slate-900",
        className
      )}
    >
      <Crown className="size-[45%]" strokeWidth={2.2} />
    </span>
  )
}

/** Avatar for anyone in a chat: the user, the Master Agent or a regular agent. */
export function ParticipantAvatar({
  who,
  seatFor,
  userInitial,
  className,
}: {
  who: Participant
  seatFor: (key: Exclude<Participant, "user" | typeof MASTER_KEY>) => OfficeSeat | null
  userInitial: string
  className?: string
}) {
  if (who === MASTER_KEY) return <MasterAvatar className={className} />
  if (who === "user") {
    return (
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground",
          className
        )}
      >
        {userInitial}
      </span>
    )
  }
  const seat = seatFor(who)
  return seat ? <AgentAvatar seat={seat} className={className} /> : <span className={cn("size-11 shrink-0 rounded-full bg-muted", className)} />
}

const STATUS: Record<AgentStatus, { label: string; badge: string; dot: string }> = {
  idle: { label: "Active", badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  working: { label: "Working", badge: "bg-brand/12 text-brand-deep dark:text-brand-glow", dot: "bg-brand animate-pulse" },
  paused: { label: "Paused", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  error: { label: "Needs attention", badge: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
}

export function AgentStatusBadge({ status, className }: { status: AgentStatus; className?: string }) {
  const s = STATUS[status]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium", s.badge, className)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  )
}
