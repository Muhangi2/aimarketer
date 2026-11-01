import "server-only"
import { isComputerAgent } from "@/lib/agent-roles"
import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"
import { ComputerStore } from "@/lib/computers/store"

/**
 * Checks the session, that the caller owns the campaign, and that the agent has a computer.
 * Only then does the route get server-side (admin) access to that one computer.
 */
export async function authorizeComputer(agent: string, campaignId: string) {
  if (!isComputerAgent(agent)) return { error: jsonError(404, "This agent has no computer") } as const
  const auth = await authorizeCampaign(campaignId)
  if ("error" in auth) return { error: auth.error } as const
  return { store: auth.store, agentKey: agent, computers: new ComputerStore(campaignId, auth.store.userId) } as const
}
