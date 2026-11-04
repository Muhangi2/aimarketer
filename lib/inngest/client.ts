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

// The user clicked Done (after logging in) or Hand back on an agent's computer
export type ComputerResumeEvent = { data: { taskId: string; campaignId: string } }

// The user ended a campaign: stop its plans and shut its computers down
export type CampaignEndEvent = { data: { campaignId: string; userId: string } }

// A scheduled post is due: publish it through the user's Blotato account
export type PostPublishEvent = { data: { postId: string; userId: string; scheduledAt: string } }

// Refresh one user's post analytics from Zernio
export type AnalyticsSyncEvent = { data: { userId: string } }

type Events = {
  "task/execute": TaskExecuteEvent
  "computer/resume": ComputerResumeEvent
  "campaign/end": CampaignEndEvent
  "post/publish": PostPublishEvent
  "analytics/sync": AnalyticsSyncEvent
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

/**
 * The event that publishes one scheduled post. Its id ties it to the post and the time, so the
 * sweep can send it again safely, and a rescheduled post gets a new one.
 */
export function postPublishEvent(post: { postId: string; userId: string; scheduledAt: string }) {
  const scheduledAt = new Date(post.scheduledAt).toISOString()
  return {
    name: "post/publish" as const,
    id: `post-${post.postId}-${scheduledAt}`,
    data: { postId: post.postId, userId: post.userId, scheduledAt },
  }
}
