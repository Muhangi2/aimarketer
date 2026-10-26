"use client"

import { cn } from "cn"
import { MASTER_KEY } from "@/lib/agent-roles"
import type { OfficeScene } from "@/lib/office-scene"
import type { WorkspaceSnapshot } from "@/lib/agents/types"
import { useAgentWorkspace } from "@/hooks/use-agent-workspace"
import { AgentAvatar } from "@/components/agents/agent-avatar"
import { AgentPanel } from "@/components/agents/agent-panel"
import { MasterAgentCard } from "@/components/agents/master-agent-card"
import { AgentStatusBadge } from "@/components/agents/participant-avatar"
import { AgentOfficePanel } from "@/components/office/agent-office-panel"

export function AgentWorkspace({
  scene,
  campaignId,
  initialSelection,
  userInitial,
  snapshot,
}: {
  scene: OfficeScene
  campaignId: string
  initialSelection?: string
  userInitial: string
  snapshot: WorkspaceSnapshot
}) {
  const seats = scene.seats
  // The agent page always has an agent open, defaulting to the Master Agent
  const workspace = useAgentWorkspace({ seats, campaignId, initialSelection: initialSelection ?? MASTER_KEY, snapshot })
  const selectedKey = workspace.selectedKey ?? MASTER_KEY

  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:h-full lg:grid-cols-2 lg:p-8">
      <div className="flex min-w-0 flex-col gap-5 lg:min-h-0">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">AI Agents</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Give requests to the Master Agent. It plans the work, assigns it to your agents and reviews the results.
          </p>
        </div>

        <div role="tablist" aria-label="Agents" className="flex shrink-0 flex-col gap-2.5">
          {/* The four agent cards below already show the team */}
          <MasterAgentCard workspace={workspace} active={selectedKey === MASTER_KEY} compact />

          {/* Regular agents: one row, scrolls sideways on small screens */}
          <div
            className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pt-1 pb-2 sm:grid sm:grid-cols-(--agent-cols) sm:overflow-visible"
            style={{ "--agent-cols": `repeat(${seats.length}, minmax(0, 1fr))` } as React.CSSProperties}
          >
            {seats.map((seat) => {
              const active = seat.role.key === selectedKey
              return (
                <button
                  key={seat.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => workspace.select(seat.role.key)}
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
                    <AgentStatusBadge status={workspace.states[seat.role.key]} className="mt-1" />
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
        </div>

        <AgentPanel
          key={selectedKey}
          agentKey={selectedKey}
          workspace={workspace}
          campaignId={campaignId}
          userInitial={userInitial}
          className="flex-1"
        />
      </div>

      <div className="min-w-0 lg:min-h-0">
        <AgentOfficePanel
          scene={scene}
          selectedSeatId={workspace.selectedSeat?.id ?? null}
          onSelectSeat={(seatId) => {
            const seat = seats.find((s) => s.id === seatId)
            if (seat) workspace.select(seat.role.key)
          }}
          pausedSeatIds={workspace.pausedSeatIds}
          className="lg:h-full"
        />
      </div>
    </div>
  )
}
