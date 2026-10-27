import "server-only"
import type { AgentKey } from "@/lib/agent-roles"
import { DISPATCH_WINDOW_MS } from "@/lib/agents/schedule"
import type { AgentStore } from "@/lib/agents/store"
import type { AgentTaskRecord } from "@/lib/agents/types"
import { inngest, taskExecuteEvent } from "@/lib/inngest/client"

/**
 * Sends tasks due within the next 15 minutes to Inngest now instead of waiting for the cron.
 * Each task is claimed (pending -> queued) first and only sent if this call won the claim.
 * If sending fails the claim is released, so the next cron run picks the task up.
 */
export async function dispatchDueTasks(store: AgentStore, candidates?: AgentTaskRecord[], agentKey?: AgentKey) {
  const dueBefore = Date.now() + DISPATCH_WINDOW_MS
  const due = candidates
    ? candidates.filter((t) => t.status === "pending" && t.scheduledAt <= dueBefore)
    : await store.listDuePendingTasks(dueBefore, agentKey)

  const dispatched: AgentTaskRecord[] = []
  for (const task of due) {
    const claimed = await store.claimForDispatch(task.id, dueBefore)
    if (!claimed?.queuedAt) continue
    try {
      await inngest.send(
        taskExecuteEvent({
          id: claimed.id,
          userId: store.userId,
          campaignId: store.campaignId,
          agentKey: claimed.agentKey,
          scheduledAt: claimed.scheduledAt,
          queuedAt: claimed.queuedAt,
        })
      )
      dispatched.push(claimed)
    } catch (error) {
      console.error(`Could not send task ${claimed.id} to Inngest; the cron will retry it`, error)
      await store
        .transitionTask(claimed.id, claimed.queuedAt, "queued", { status: "pending", queuedAt: null })
        .catch((releaseError) => console.error(`Could not release task ${claimed.id}`, releaseError))
    }
  }
  return dispatched
}
