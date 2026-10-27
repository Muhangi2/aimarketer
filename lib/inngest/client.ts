import { EventSchemas, Inngest } from "inngest"

export type TaskExecuteEvent = {
  data: {
    taskId: string
    userId: string
    campaignId: string
    agentKey: string
    // ISO timestamps (millisecond precision); queuedAt identifies this dispatch of the occurrence
    scheduledAt: string
    queuedAt: string
  }
}

type Events = {
  "task/execute": TaskExecuteEvent
}

// Locally, INNGEST_DEV=1 points this at the dev server (npm run inngest:dev)
export const inngest = new Inngest({
  id: "aimarketer",
  eventKey: process.env.INNGEST_EVENT_KEY,
  schemas: new EventSchemas().fromRecord<Events>(),
})

/** The event that runs one task occurrence. Its id makes duplicate sends of one dispatch a no-op. */
export function taskExecuteEvent(task: {
  id: string
  userId: string
  campaignId: string
  agentKey: string
  scheduledAt: number
  queuedAt: number
}) {
  const scheduledAt = new Date(task.scheduledAt).toISOString()
  const queuedAt = new Date(task.queuedAt).toISOString()
  return {
    name: "task/execute" as const,
    id: `task-${task.id}-${queuedAt}`,
    data: { taskId: task.id, userId: task.userId, campaignId: task.campaignId, agentKey: task.agentKey, scheduledAt, queuedAt },
  }
}
