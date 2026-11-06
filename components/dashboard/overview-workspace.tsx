"use client"

import type { OfficeScene } from "@/lib/office-scene"
import type { WorkspaceSnapshot } from "@/lib/agents/types"
import { useAgentWorkspace } from "@/hooks/use-agent-workspace"
import { AgentPanel } from "@/components/agents/agent-panel"
import { MasterAgentCard } from "@/components/agents/master-agent-card"
import { AgentOfficePanel } from "@/components/office/agent-office-panel"
import { ComputerViewer } from "@/components/computers/computer-viewer"

/**
 * Overview layout: page header and key numbers across the top, then a wide main column
 * (agents and upcoming posts) and a narrow side column (office preview, setup, activity).
 * Opening an agent swaps the main column for that agent's chat without leaving the page.
 */
export function OverviewWorkspace({
  scene,
  campaignId,
  userInitial,
  initialSelection,
  snapshot,
  header,
  stats,
  aside,
  children,
}: {
  scene: OfficeScene
  campaignId: string
  userInitial: string
  initialSelection?: string
  snapshot: WorkspaceSnapshot
  header?: React.ReactNode
  // Row of key numbers under the header
  stats?: React.ReactNode
  // Side column panels, under the office preview
  aside?: React.ReactNode
  // Main column panels, under the Master Agent card
  children: React.ReactNode
}) {
  const workspace = useAgentWorkspace({ seats: scene.seats, campaignId, initialSelection: initialSelection ?? null, snapshot })
  const { selectedKey } = workspace

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {header}
      {stats}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {selectedKey ? (
          <div className="min-w-0 xl:sticky xl:top-8 xl:h-[calc(100svh-9rem)]">
            <AgentPanel
              key={selectedKey}
              agentKey={selectedKey}
              workspace={workspace}
              campaignId={campaignId}
              userInitial={userInitial}
              onClose={() => workspace.select(null)}
              className="h-[70svh] xl:h-full"
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-6 animate-in fade-in duration-300">
            <MasterAgentCard workspace={workspace} />
            {children}
          </div>
        )}

        <aside className="flex min-w-0 flex-col gap-6">
          <AgentOfficePanel
            scene={scene}
            fill={false}
            selectedSeatId={workspace.selectedSeat?.id ?? null}
            onSelectSeat={(seatId) => {
              const seat = scene.seats.find((s) => s.id === seatId)
              if (seat) workspace.select(seat.role.key)
            }}
            pausedSeatIds={workspace.pausedSeatIds}
            seatStatus={(seat) => workspace.statusFor(seat.role.key)}
          />
          {aside}
        </aside>
      </div>
      <ComputerViewer workspace={workspace} />
    </div>
  )
}
