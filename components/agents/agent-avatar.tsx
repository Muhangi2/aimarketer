import { cn } from "cn"
import type { OfficeSeat } from "@/lib/office-scene"

// Head-and-shoulders crop of the agent's first office animation frame
export function AgentAvatar({ seat, className }: { seat: OfficeSeat; className?: string }) {
  return (
    <span
      className={cn(
        "relative block size-11 shrink-0 overflow-hidden rounded-full bg-gradient-to-b from-brand-glow to-brand-glow ring-2 ring-white dark:from-slate-700 dark:to-slate-800 dark:ring-slate-900",
        className
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={seat.frames[0]}
        alt=""
        draggable={false}
        className="absolute top-[2%] left-1/2 w-[190%] max-w-none -translate-x-1/2 select-none"
      />
    </span>
  )
}
