import { cn } from "cn"
import { LIVE_STATUS_STYLE, type LiveStatus } from "@/lib/agents/live-status"

/** "Running", "Waiting for you", "Done"… with an optional line for what the agent is doing right now. */
export function LiveStatusBadge({ status, className }: { status: LiveStatus; className?: string }) {
  const style = LIVE_STATUS_STYLE[status.key]
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap", style.badge, className)}>
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {status.label}
    </span>
  )
}

export function LiveActivity({ status, fallback, className }: { status: LiveStatus; fallback?: string; className?: string }) {
  const text = status.activity ?? fallback
  if (!text) return null
  return (
    <span className={cn("block truncate text-[11px] text-muted-foreground", className)} title={text}>
      {text}
    </span>
  )
}
