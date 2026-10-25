import { getDashboardContext } from "@/lib/dashboard"
import { getOfficeScene } from "@/lib/office-scene"
import { AgentWorkspace } from "@/components/agents/agent-workspace"

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { user, activeCampaign } = await getDashboardContext()
  const [scene, { agent }] = await Promise.all([getOfficeScene(activeCampaign.office_image), searchParams])

  return (
    <AgentWorkspace
      // Fresh selection and chats when the active campaign changes
      key={activeCampaign.id}
      scene={scene}
      campaignId={activeCampaign.id}
      initialSeatId={agent}
      userInitial={user.name.trim()[0]?.toUpperCase() ?? "U"}
    />
  )
}
