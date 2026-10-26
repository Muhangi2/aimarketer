import { getDashboardContext } from "@/lib/dashboard"
import { getOfficeScene } from "@/lib/office-scene"
import { getWorkspaceSnapshot } from "@/lib/agents/snapshot"
import { AgentWorkspace } from "@/components/agents/agent-workspace"

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { user, activeCampaign } = await getDashboardContext()
  const [scene, snapshot, { agent }] = await Promise.all([
    getOfficeScene(activeCampaign.office_image),
    getWorkspaceSnapshot(activeCampaign.id),
    searchParams,
  ])

  return (
    <AgentWorkspace
      // Fresh selection and chats when the active campaign changes
      key={activeCampaign.id}
      scene={scene}
      campaignId={activeCampaign.id}
      initialSelection={agent}
      snapshot={snapshot}
      userInitial={user.name.trim()[0]?.toUpperCase() ?? "U"}
    />
  )
}
