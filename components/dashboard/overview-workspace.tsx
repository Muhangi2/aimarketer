"use client"

import type { OfficeScene } from "@/lib/office-scene"
import type { WorkspaceSnapshot } from "@/lib/agents/types"
import { useAgentWorkspace } from "@/hooks/use-agent-workspace"
import { AgentPanel } from "@/components/agents/agent-panel"
import { MasterAgentCard } from "@/components/agents/master-agent-card"
import { AgentOfficePanel } from "@/components/office/agent-office-panel"
import { ComputerViewer } from "@/components/computers/computer-viewer"

// Height of the pinned columns: the window minus the 4rem header and page padding
const PINNED = "lg:sticky lg:top-8 lg:h-[calc(100svh-8rem)] lg:self-start"

/**
 * Overview layout: the overview panels (children) on the left and the office on the right.
 * Opening the Master Agent, or clicking an agent in the office, swaps the left side for that
 * agent's chat without leaving the page.
 */
export function OverviewWorkspace({
  scene,
  campaignId,
  userInitial,
  initialSelection,
  snapshot,
  header,
  children,
}: {
  scene: OfficeScene
  campaignId: string
  userInitial: string
  initialSelection?: string
  snapshot: WorkspaceSnapshot
  // Shown above the Master Agent card
  header?: React.ReactNode
  children: React.ReactNode
}) {
  const workspace = useAgentWorkspace({ seats: scene.seats, campaignId, initialSelection: initialSelection ?? null, snapshot })
  const { selectedKey } = workspace

  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2 lg:p-8">
      {selectedKey ? (
        <div className={`min-w-0 ${PINNED}`}>
          <AgentPanel
            key={selectedKey}
            agentKey={selectedKey}
            workspace={workspace}
            campaignId={campaignId}
            userInitial={userInitial}
            onClose={() => workspace.select(null)}
            className="lg:h-full"
          />
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-6 animate-in fade-in duration-300">
          {header}
          <MasterAgentCard workspace={workspace} />
          {children}
        </div>
      )}

      <div className={`min-w-0 ${PINNED}`}>
        <AgentOfficePanel
          scene={scene}
          selectedSeatId={workspace.selectedSeat?.id ?? null}
          onSelectSeat={(seatId) => {
            const seat = scene.seats.find((s) => s.id === seatId)
            if (seat) workspace.select(seat.role.key)
          }}
          pausedSeatIds={workspace.pausedSeatIds}
          seatStatus={(seat) => workspace.statusFor(seat.role.key)}
          className="lg:h-full"
        />
      </div>
      <ComputerViewer workspace={workspace} />
    </div>
  )
}
