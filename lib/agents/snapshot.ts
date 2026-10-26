import "server-only"
import { THREAD_KEYS } from "@/lib/agent-roles"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { AgentStore } from "@/lib/agents/store"
import type { AgentStates, WorkspaceSnapshot } from "@/lib/agents/types"

const EMPTY: WorkspaceSnapshot = {
  messages: [],
  requests: [],
  tasks: [],
  states: Object.fromEntries(THREAD_KEYS.map((k) => [k, "idle"])) as AgentStates,
}

/** Saved chats, requests, tasks and statuses for a campaign's agent workspace. */
export async function getWorkspaceSnapshot(campaignId: string): Promise<WorkspaceSnapshot> {
  try {
    const store = new AgentStore(await createInsForgeServerClient(), campaignId)
    return await store.snapshot()
  } catch (error) {
    // The page still works without history; new messages will save once the database is reachable
    console.error("Could not load the agent workspace", error)
    return EMPTY
  }
}
