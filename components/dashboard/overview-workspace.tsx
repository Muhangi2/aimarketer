"use client"

import type { OfficeScene } from "@/lib/office-scene"
import { useAgentWorkspace } from "@/hooks/use-agent-workspace"
import { AgentPanel } from "@/components/agents/agent-panel"
import { AgentOfficePanel } from "@/components/office/agent-office-panel"

// Height of the pinned columns: the window minus the 4rem header and page padding
const PINNED = "lg:sticky lg:top-8 lg:h-[calc(100svh-8rem)] lg:self-start"

/**
 * Overview layout: the overview panels (children) on the left and the office on the right.
 * Clicking an agent in the office swaps the left side for that agent's chat, without leaving the page.
 */
export function OverviewWorkspace({
  scene,
  campaignId,
  userInitial,
  initialSeatId,
  children,
}: {
  scene: OfficeScene
  campaignId: string
  userInitial: string
  initialSeatId?: string
  children: React.ReactNode
}) {
  const workspace = useAgentWorkspace(scene.seats, initialSeatId ?? null, campaignId)
  const { selected } = workspace

  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2 lg:p-8">
      {selected ? (
        <div className={`min-w-0 ${PINNED}`}>
          <AgentPanel
            key={selected.id}
            seat={selected}
            workspace={workspace}
            campaignId={campaignId}
            userInitial={userInitial}
            onClose={() => workspace.select(null)}
            className="lg:h-full"
          />
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-6 animate-in fade-in duration-300">{children}</div>
      )}

      <div className={`min-w-0 ${PINNED}`}>
        <AgentOfficePanel
          scene={scene}
          selectedSeatId={selected?.id ?? null}
          onSelectSeat={workspace.select}
          pausedSeatIds={workspace.paused}
          className="lg:h-full"
        />
      </div>
    </div>
  )
}
