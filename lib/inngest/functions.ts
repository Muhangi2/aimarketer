import { NonRetriableError, RetryAfterError } from "inngest"
import { inngest, postPublishEvent, taskExecuteEvent } from "@/lib/inngest/client"
import { getInsForgeAdmin } from "@/lib/insforge/admin"
import { COMPUTER_AGENT_KEYS, isComputerAgent } from "@/lib/agent-roles"
import { DISPATCH_WINDOW_MS, iso } from "@/lib/agents/schedule"
import {
  answerQuestion,
  checkUserWait,
  completeTask,
  computerSlice,
  expireTask,
  failTask,
  needsInput,
  reviewWork,
  runAgent,
  startTask,
  startWaitingForUser,
  stopComputerTask,
  type AgentAttempt,
  type ComputerStep,
  type ReviewResult,
  type RunContext,
  type UserWaitStatus,
} from "@/lib/agents/task-runner"
import { markCampaignEnded, shutDownComputer, stopCampaignPlans } from "@/lib/computers/campaign"
import { pauseDesktop } from "@/lib/computers/desktop"
import { ComputerStore, listIdleComputers } from "@/lib/computers/store"
import { BlotatoError } from "@/lib/blotato/client"
import { ZernioError } from "@/lib/zernio/client"
import { listZernioUsers, syncAnalyticsFor } from "@/lib/analytics/sync"
import {
  PublishError,
  buildSubmissions,
  checkPublishStatus,
  claimPost,
  failPost,
  cancelOnZernio,
  finishPost,
  heldOnZernio,
  listDuePosts,
  savePublishResults,
  submitPost,
} from "@/lib/posts/publish"
import type { PublishResult } from "@/lib/posts/types"

// Claim slightly more than the 15 minute interval so cron jitter never leaves a gap.
// Overlap is harmless: a task can only be claimed once.
const CLAIM_WINDOW = `${DISPATCH_WINDOW_MS / 60_000 + 1} minutes`
// A task still queued after this long lost its event; it is sent again under the same event id
const STALE_QUEUED_MS = 30 * 60 * 1000
// Agent attempts per run: questions the Master Agent answers plus one revision
const MAX_AGENT_ATTEMPTS = 4
// Said to the agent on its last attempt, so the run ends with work rather than another question
const DELIVER_NOW = "This is your last attempt: do not ask any more questions. Deliver the finished work now, stating any assumptions."
const MAX_REVISIONS = 1
// Background steps (a few minutes each) a computer agent gets per attempt
const MAX_COMPUTER_SLICES = 20
// While waiting for the user, the task is re-checked this often in case an event was missed
const USER_WAIT_CHUNK = "30m"
// Enough chunks to cover the 24 hour expiry
const MAX_USER_WAIT_CHECKS = 50
// Desktops nobody used for this long are paused
const IDLE_PAUSE_MS = 3 * 60 * 1000
// Zernio and Blotato publish in the background: check every 15 seconds for up to ~12 minutes
// (videos take a while to process)
const PUBLISH_CHECK_INTERVAL = "15s"
const MAX_PUBLISH_CHECKS = 48

type Stopped = { kind: "stopped"; reason: string }

type ClaimedRow = {
  id: string
  user_id: string
  campaign_id: string
  agent_key: string
  scheduled_at: string
  queued_at: string
}

const toEvent = (row: ClaimedRow) =>
  taskExecuteEvent({
    id: row.id,
    userId: row.user_id,
    campaignId: row.campaign_id,
    agentKey: row.agent_key,
    scheduledAt: Date.parse(row.scheduled_at),
    queuedAt: Date.parse(row.queued_at),
  })

/**
 * Every 15 minutes: claims pending tasks due in the next 15 minutes (pending -> queued in one
 * atomic update) and sends a task/execute event for each. Also re-sends events for tasks that
 * have been queued too long; the event id makes that a no-op if the first event arrived.
 */
export const dispatchDueTasks = inngest.createFunction(
  { id: "dispatch-due-agent-tasks", name: "Dispatch due agent tasks", concurrency: { limit: 1 } },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const claimed = await step.run("claim-due-tasks", async () => {
      const { data, error } = await getInsForgeAdmin().database.rpc("claim_due_agent_tasks", { p_window: CLAIM_WINDOW })
      if (error) throw new Error(`Could not claim due tasks: ${error.message}`)
      return (data ?? []) as ClaimedRow[]
    })

    const stale = await step.run("find-stale-queued-tasks", async () => {
      const { data, error } = await getInsForgeAdmin()
        .database.from("agent_task")
        .select("id, user_id, campaign_id, agent_key, scheduled_at, queued_at")
        .eq("status", "queued")
        .lt("queued_at", iso(Date.now() - STALE_QUEUED_MS))
        .limit(500)
      if (error) throw new Error(`Could not load queued tasks: ${error.message}`)
      return (data ?? []) as ClaimedRow[]
    })

    const events = [...claimed, ...stale].map(toEvent)
    if (events.length > 0) await step.sendEvent("send-task-events", events)

    // Scheduled posts due before the next run, or missed: (re)send their publish events. The
    // event id makes this a no-op for posts whose event already arrived when they were scheduled.
    const duePosts = await step.run("find-due-posts", () => listDuePosts(Date.now() + DISPATCH_WINDOW_MS + 60_000))
    if (duePosts.length > 0) await step.sendEvent("send-post-events", duePosts.map(postPublishEvent))

    return { claimed: claimed.length, resent: stale.length, posts: duePosts.length }
  }
)

/**
 * Runs one task occurrence: waits until it is due, claims it, has the agent do the work (with the
 * Master Agent answering questions and reviewing), then saves the result and reschedules repeats.
 */
export const executeTask = inngest.createFunction(
  {
    id: "execute-agent-task",
    name: "Execute agent task",
    retries: 3,
    concurrency: [
      // Each agent works on at most 50 tasks at a time across all users
      { key: "event.data.agentKey", limit: 50 },
      // Keeps one user's backlog from starving everyone else
      { key: "event.data.userId", limit: 3 },
    ],
    // Second line of defence after the event id: one run per dispatch
    idempotency: 'event.data.taskId + "-" + event.data.queuedAt',
    onFailure: async ({ event, error }) => {
      const data = event.data.event.data
      await failTask(contextFrom(data), error.message || "The task failed after several attempts.")
    },
  },
  { event: "task/execute" },
  async ({ event, step }) => {
    const ctx = contextFrom(event.data)
    await step.sleepUntil("wait-until-scheduled", new Date(ctx.scheduledAt))

    const start = await step.run("start", () => startTask(ctx))
    if (start.action !== "run") return start

    const { task, runId, campaignName, inputs } = start
    let clarifications = task.clarifications
    let feedback: string | null = null
    let revisions = 0
    // Work already delivered, kept in case a revision attempt doesn't deliver
    let delivered: string | null = null

    // Waits (in 30 minute chunks) until the user clicks Done / Hand back, or the 24 hours run out
    const waitForUser = async (label: string): Promise<UserWaitStatus> => {
      for (let i = 0; i < MAX_USER_WAIT_CHECKS; i++) {
        const status: UserWaitStatus = await step.run(`user-check-${label}-${i}`, () => checkUserWait(ctx, task.id))
        if (status !== "waiting") return status
        await step.waitForEvent(`user-wait-${label}-${i}`, {
          event: "computer/resume",
          timeout: USER_WAIT_CHUNK,
          if: `async.data.taskId == "${task.id}"`,
        })
      }
      return "expired"
    }

    // A computer agent works in slices of a few minutes; its run is saved in between
    const computerAttempt = async (attempt: number, instruction: string | null): Promise<AgentAttempt | Stopped> => {
      for (let slice = 0; slice < MAX_COMPUTER_SLICES; slice++) {
        const label = `${attempt}-${slice}`
        const outcome: ComputerStep = await step.run(`computer-${label}`, () =>
          computerSlice(ctx, task, campaignName, inputs, clarifications, instruction, attempt)
        )
        if (outcome.kind === "done") return outcome.attempt
        if (outcome.kind === "continue") continue
        if (outcome.kind === "stopped") {
          await step.run(`stop-${label}`, () => stopComputerTask(ctx, task, outcome.reason))
          return outcome
        }

        // Login, captcha or take over: park the task until the user is done
        const parked = await step.run(`wait-start-${label}`, () => startWaitingForUser(ctx, task, outcome))
        const waited: UserWaitStatus = parked.waiting ? await waitForUser(label) : "stopped"
        if (waited === "expired") {
          await step.run(`expire-${label}`, () => expireTask(ctx, task))
          return { kind: "stopped", reason: "Expired waiting for the user" }
        }
        if (waited === "stopped") {
          await step.run(`stop-${label}`, () => stopComputerTask(ctx, task, "The task was stopped while waiting for you."))
          return { kind: "stopped", reason: "Stopped while waiting for the user" }
        }
        // Resolved: the next slice picks the saved run back up
      }
      throw new NonRetriableError("The agent ran out of time on its computer.")
    }

    for (let attempt = 0; attempt < MAX_AGENT_ATTEMPTS; attempt++) {
      const lastAttempt = attempt === MAX_AGENT_ATTEMPTS - 1
      const instruction: string | null = lastAttempt ? [feedback, DELIVER_NOW].filter(Boolean).join("\n") : feedback
      const result: AgentAttempt | Stopped = isComputerAgent(task.agentKey)
        ? await computerAttempt(attempt, instruction)
        : await step.run(`agent-attempt-${attempt}`, (): Promise<AgentAttempt> => runAgent(task, campaignName, inputs, clarifications, instruction, ctx))
      if (result.kind === "stopped") return { action: "stopped", reason: result.reason }

      if (result.kind === "question") {
        if (lastAttempt) break
        const answer = await step.run(`answer-question-${attempt}`, () => answerQuestion(ctx, task, campaignName, inputs, result.question))
        if (answer.answered) {
          clarifications = clarifications ? `${clarifications}\n${answer.note}` : answer.note
          continue
        }
        await step.run("ask-user", () => needsInput(ctx, task, runId, clarifications, answer.forUser))
        return { action: "needs_input" }
      }

      const review: ReviewResult = await step.run(`review-${attempt}`, (): Promise<ReviewResult> =>
        reviewWork(ctx, task, campaignName, result.output, revisions < MAX_REVISIONS && attempt < MAX_AGENT_ATTEMPTS - 1)
      )
      if (review.revise) {
        revisions++
        feedback = review.feedback
        delivered = result.output
        continue
      }

      const saved = await step.run("complete", () => completeTask(ctx, task, runId, campaignName, result.output, review.feedback))
      return { action: "completed", nextRunAt: saved.next }
    }

    // The revision didn't come through: keep the work the agent delivered before it, with the review note
    if (delivered) {
      const work = delivered
      const saved = await step.run("complete-with-earlier-work", () => completeTask(ctx, task, runId, campaignName, work, feedback))
      return { action: "completed", nextRunAt: saved.next, note: "Kept the work from before the requested revision" }
    }

    // Nothing delivered. Retrying would replay the same remembered steps, so fail straight to onFailure
    throw new NonRetriableError("The agent kept asking questions instead of delivering the work.")
  }
)

function contextFrom(data: { taskId: string; userId: string; campaignId: string; scheduledAt: string; queuedAt: string }): RunContext {
  return {
    taskId: data.taskId,
    userId: data.userId,
    campaignId: data.campaignId,
    scheduledAt: Date.parse(data.scheduledAt),
    queuedAt: Date.parse(data.queuedAt),
  }
}

/**
 * Every minute: pauses desktops nobody has used for 3 minutes. A screenshot is saved first so
 * the UI can still show the screen while it's paused.
 */
export const pauseIdleComputers = inngest.createFunction(
  { id: "pause-idle-computers", name: "Pause idle agent computers", concurrency: { limit: 1 } },
  { cron: "* * * * *" },
  async ({ step }) => {
    const idle = await step.run("find-idle-computers", () => listIdleComputers(Date.now() - IDLE_PAUSE_MS))
    for (const computer of idle) {
      await step.run(`pause-${computer.campaignId}-${computer.agentKey}`, async () => {
        await pauseDesktop(new ComputerStore(computer.campaignId, computer.userId), computer)
      })
    }
    return { paused: idle.length }
  }
)

/** "End campaign": stops its plans, saves files left on the computers, then shuts them down. */
export const endCampaign = inngest.createFunction(
  { id: "end-campaign", name: "End campaign", retries: 3, idempotency: "event.data.campaignId" },
  { event: "campaign/end" },
  async ({ event, step }) => {
    const { campaignId, userId } = event.data
    await step.run("stop-plans", () => stopCampaignPlans(campaignId, userId))
    let saved = 0
    for (const agentKey of COMPUTER_AGENT_KEYS) {
      saved += await step.run(`shut-down-${agentKey}`, () => shutDownComputer(campaignId, userId, agentKey))
    }
    await step.run("mark-ended", () => markCampaignEnded(campaignId, userId, saved))
    return { saved }
  }
)

// Turns errors from the publish steps into Inngest's retry behaviour
async function publishStep<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof PublishError) throw new NonRetriableError(error.message)
    if ((error instanceof BlotatoError || error instanceof ZernioError) && error.status === 429) {
      throw new RetryAfterError(error.message, (error.retryAfter ?? 60) * 1000)
    }
    throw error
  }
}

/**
 * Publishes one scheduled post through the user's accounts (Zernio or Blotato): waits until it's
 * due, claims it (skipped if it was edited or rescheduled since), sends each platform's copy, then
 * checks until each one is published or failed.
 */
export const publishPost = inngest.createFunction(
  {
    id: "publish-scheduled-post",
    name: "Publish scheduled post",
    retries: 4,
    // One user's posts go out a few at a time, well under Zernio's and Blotato's rate limits
    concurrency: [{ key: "event.data.userId", limit: 2 }],
    idempotency: 'event.data.postId + "-" + event.data.scheduledAt',
    onFailure: async ({ event, error }) => {
      const { postId, userId } = event.data.event.data
      await failPost(postId, userId, error.message || "Publishing failed after several attempts.")
    },
  },
  { event: "post/publish" },
  async ({ event, step }) => {
    const { postId, userId, scheduledAt } = event.data
    await step.sleepUntil("wait-until-scheduled", new Date(scheduledAt))

    const post = await step.run("claim", () => claimPost(postId, userId, scheduledAt))
    if (!post) return { action: "skipped", reason: "The post was changed, rescheduled or deleted" }

    const submissions = await step.run("prepare", () => publishStep(() => buildSubmissions(post, userId, scheduledAt)))
    // Copies Zernio already holds publish on their own; they're only followed up here
    const held = heldOnZernio(post.publishResults)
    // Fixed once, so a retried submit step sends the very same request
    const submitAt = await step.run("submit-at", () => new Date(Date.now() + 60_000).toISOString())

    // One step per platform, so a retry never posts the same platform twice
    let results: PublishResult[] = []
    for (const submission of submissions) {
      const copy = held.find((r) => r.platform === submission.platform && r.accountId === submission.accountId)
      const result: PublishResult = copy
        ? { ...copy, status: "in-progress" }
        : await step.run(`submit-${submission.platform}`, () => publishStep(() => submitPost(userId, submission, submitAt)))
      results = [...results, result]
      await step.run(`save-${submission.platform}`, () => savePublishResults(postId, userId, results))
    }

    // Copies left over from an edit Zernio couldn't be told about
    const stale = held.filter((r) => !results.some((x) => x.submissionId === r.submissionId))
    if (stale.length > 0) await step.run("cancel-stale", () => cancelOnZernio(userId, stale))

    for (let i = 0; i < MAX_PUBLISH_CHECKS && results.some((r) => r.status === "in-progress"); i++) {
      await step.sleep(`wait-for-publish-${i}`, PUBLISH_CHECK_INTERVAL)
      results = await step.run(`check-${i}`, () => publishStep(() => checkPublishStatus(userId, results)))
    }

    const outcome = await step.run("finish", () => finishPost(postId, userId, results))
    return { action: outcome.status, results }
  }
)

/** Every 6 hours: queue an analytics sync for each user with a Zernio profile. */
export const sweepAnalytics = inngest.createFunction(
  { id: "sweep-analytics", name: "Queue analytics syncs" },
  { cron: "0 */6 * * *" },
  async ({ step }) => {
    const users = await step.run("list-users", () => listZernioUsers())
    if (users.length === 0) return { queued: 0 }
    // The hour in the id makes a re-run of the same sweep a no-op
    const hour = new Date().toISOString().slice(0, 13)
    await step.sendEvent(
      "queue-syncs",
      users.map((userId) => ({ name: "analytics/sync" as const, id: `analytics-${userId}-${hour}`, data: { userId } }))
    )
    return { queued: users.length }
  }
)

/** Copies one user's post analytics from Zernio into the database. */
export const syncAnalytics = inngest.createFunction(
  {
    id: "sync-analytics",
    name: "Sync post analytics",
    retries: 3,
    // One sync per user at a time, and a few users at once, well under Zernio's rate limits
    concurrency: [{ key: "event.data.userId", limit: 1 }, { limit: 3 }],
  },
  { event: "analytics/sync" },
  async ({ event, step }) => {
    const result = await step.run("sync", async () => {
      try {
        return await syncAnalyticsFor(event.data.userId)
      } catch (error) {
        if (error instanceof ZernioError && error.status === 429) throw new RetryAfterError(error.message, (error.retryAfter ?? 60) * 1000)
        throw error
      }
    })
    return result
  }
)

export const functions = [dispatchDueTasks, executeTask, pauseIdleComputers, endCampaign, publishPost, sweepAnalytics, syncAnalytics]
