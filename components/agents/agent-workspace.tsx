"use client"

import { cn } from "cn"
import type { OfficeScene } from "@/lib/office-scene"
import { useAgentWorkspace } from "@/hooks/use-agent-workspace"
import { AgentAvatar } from "@/components/agents/agent-avatar"
import { AgentPanel } from "@/components/agents/agent-panel"
import { AgentOfficePanel } from "@/components/office/agent-office-panel"

export function AgentWorkspace({
  scene,
  campaignId,
  initialSeatId,
  userInitial,
}: {
  scene: OfficeScene
  campaignId: string
  initialSeatId?: string
  userInitial: string
}) {
  const seats = scene.seats
  // The agent page always has an agent open, defaulting to the first one
  const workspace = useAgentWorkspace(seats, initialSeatId ?? seats[0]?.id ?? null, campaignId)
  const selected = workspace.selected ?? seats[0]

  if (!selected) {
    return <p className="p-8 text-sm text-muted-foreground">This office has no agents yet.</p>
  }

  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:h-full lg:grid-cols-2 lg:p-8">
      <div className="flex min-w-0 flex-col gap-5 lg:min-h-0">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">AI Agents</h2>
          <p className="mt-1 text-sm text-muted-foreground">Chat with your agents, give them tasks and see their work.</p>
        </div>

        {/* Agent picker: one row, scrolls sideways on small screens */}
        <div
          role="tablist"
          aria-label="Agents"
          className="-mx-1 flex shrink-0 gap-2.5 overflow-x-auto px-1 pt-1 pb-2 sm:grid sm:grid-cols-(--agent-cols) sm:overflow-visible"
          style={{ "--agent-cols": `repeat(${seats.length}, minmax(0, 1fr))` } as React.CSSProperties}
        >
          {seats.map((seat) => {
            const active = seat.id === selected.id
            const seatPaused = workspace.paused.has(seat.id)
            return (
              <button
                key={seat.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => workspace.select(seat.id)}
                className={cn(
                  "relative flex min-w-40 items-center gap-2.5 rounded-2xl border p-2 pr-3 text-left transition-all duration-300 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:min-w-0",
                  active
                    ? "border-primary/50 bg-accent shadow-md shadow-primary/10 ring-2 ring-primary/25"
                    : "bg-card hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                )}
              >
                <AgentAvatar seat={seat} className="size-10" />
                <span className="min-w-0">
                  <span className="line-clamp-2 text-[13px] leading-tight font-semibold">{seat.role.name}</span>
                  <span
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      seatPaused
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", seatPaused ? "bg-amber-500" : "bg-emerald-500")} />
                    {seatPaused ? "Paused" : "Active"}
                  </span>
                </span>
                {/* Popover pointer linking the selected card to the panel below */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute -bottom-[7px] left-8 size-3 rotate-45 border-r border-b border-primary/50 bg-accent animate-in fade-in zoom-in-50 duration-300"
                  />
                )}
              </button>
            )
          })}
        </div>

        <AgentPanel
          key={selected.id}
          seat={selected}
          workspace={workspace}
          campaignId={campaignId}
          userInitial={userInitial}
          className="flex-1"
        />
      </div>

      <div className="min-w-0 lg:min-h-0">
        <AgentOfficePanel
          scene={scene}
          selectedSeatId={selected.id}
          onSelectSeat={workspace.select}
          pausedSeatIds={workspace.paused}
          className="lg:h-full"
        />
      </div>
    </div>
  )
}
