import "server-only"
import { MASTER_KEY, type ComputerAgentKey } from "@/lib/agent-roles"
import { AgentStore, StoreError } from "@/lib/agents/store"
import { iso } from "@/lib/agents/schedule"
import { shutDownDesktop } from "@/lib/computers/desktop"
import { ComputerStore } from "@/lib/computers/store"
import { getInsForgeAdmin } from "@/lib/insforge/admin"

/*
 * Ending a campaign: its plans stop, files left on its computers are uploaded, and the
 * computers are shut down for good. Runs in the background (Inngest "campaign/end").
 */

const STOPPABLE_TASKS = ["pending", "queued", "in_progress", "in_review", "needs_input", "waiting_for_user"]
const OPEN_REQUESTS = ["planning", "running", "awaiting_clarification", "waiting"]

/** Cancels every task and request still open. Safe to run more than once. */
export async function stopCampaignPlans(campaignId: string, userId: string) {
  const db = getInsForgeAdmin().database
  const tasks = await db
    .from("agent_task")
    .update({ status: "cancelled", error: "The campaign ended.", waiting_until: null })
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .in("status", STOPPABLE_TASKS)
  if (tasks.error) throw new StoreError("cancel tasks", tasks.error)
  const requests = await db
    .from("agent_request")
    .update({ status: "cancelled", clarification_question: null })
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .in("status", OPEN_REQUESTS)
  if (requests.error) throw new StoreError("cancel requests", requests.error)
  const states = await db
    .from("agent_state")
    .update({ status: "idle", current_task_id: null, activity: null })
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .neq("status", "paused")
  if (states.error) throw new StoreError("reset agents", states.error)
}

/** Uploads what's left on one computer and shuts it down. Returns how many files were saved. */
export async function shutDownComputer(campaignId: string, userId: string, agentKey: ComputerAgentKey) {
  const computers = new ComputerStore(campaignId, userId)
  const computer = await computers.get(agentKey)
  if (!computer || computer.status === "shut_down") return 0
  await computers.update(agentKey, { activity: "Saving files and shutting down" })
  const files = await shutDownDesktop(computers, computer)
  for (const file of files) {
    await computers.addArtifact({
      taskId: null,
      agentKey,
      kind: file.mimeType?.startsWith("image/") ? "image" : "file",
      name: file.name,
      url: file.url,
      mimeType: file.mimeType,
      sizeBytes: file.size,
      source: "campaign_end",
    })
  }
  return files.length
}

export async function markCampaignEnded(campaignId: string, userId: string, savedFiles: number) {
  const { error } = await getInsForgeAdmin()
    .database.from("campaign")
    .update({ status: "ended", ended_at: iso(Date.now()) })
    .eq("id", campaignId)
    .eq("user_id", userId)
  if (error) throw new StoreError("end campaign", error)
  const files = savedFiles === 0 ? "No files were left on the computers." : `${savedFiles} file${savedFiles === 1 ? "" : "s"} left on the computers ${savedFiles === 1 ? "was" : "were"} saved.`
  await new AgentStore(getInsForgeAdmin(), campaignId, userId).addMessage({
    thread: MASTER_KEY,
    sender: MASTER_KEY,
    recipient: "user",
    kind: "update",
    content: `This campaign has ended. I stopped all plans and shut the agents' computers down for good. ${files}`,
  })
}
