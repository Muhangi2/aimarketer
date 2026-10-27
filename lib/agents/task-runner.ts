import "server-only"
import { MASTER_KEY } from "@/lib/agent-roles"
import { QUESTION_PREFIX, ROLES, taskPrompt, taskSystemPrompt } from "@/lib/ai/agents"
import { completeText } from "@/lib/ai/llm"
import { answerAgentQuestion, reviewOutput, summarize } from "@/lib/ai/master"
import { dispatchDueTasks } from "@/lib/agents/dispatch"
import { nextOccurrence } from "@/lib/agents/schedule"
import { AgentStore, type NewMessage } from "@/lib/agents/store"
import type { AgentTaskRecord, MessageKind, TaskStatus } from "@/lib/agents/types"
import { getInsForgeAdmin } from "@/lib/insforge/admin"

/*
 * The steps of one task run, called from the Inngest executor (lib/inngest/functions.ts).
 * Every state change is conditional on the dispatch (queuedAt) that owns the run, so a retried
 * or duplicated step can never run a task twice or overwrite someone else's change.
 */

// If a task it depends on isn't finished yet, check again this much later
const DEPENDENCY_RECHECK_MS = 10 * 60 * 1000
const TERMINAL: TaskStatus[] = ["completed", "failed", "blocked", "cancelled"]

export type RunContext = {
  taskId: string
  userId: string
  campaignId: string
  queuedAt: number
  scheduledAt: number
}

export type TaskInput = { agentName: string; title: string; output: string }

export type AgentAttempt = { kind: "question"; question: string } | { kind: "output"; output: string }
export type ReviewResult = { revise: true; feedback: string } | { revise: false; feedback: string | null }

export type StartResult =
  | { action: "skip"; reason: string }
  | { action: "deferred"; reason: string; until: number }
  | { action: "blocked"; reason: string }
  | { action: "run"; task: AgentTaskRecord; runId: string; campaignName: string; inputs: TaskInput[] }

export function storeFor(ctx: Pick<RunContext, "campaignId" | "userId">) {
  return new AgentStore(getInsForgeAdmin(), ctx.campaignId, ctx.userId)
}

async function campaignName(ctx: Pick<RunContext, "campaignId" | "userId">) {
  const { data } = await getInsForgeAdmin()
    .database.from("campaign")
    .select("name")
    .eq("id", ctx.campaignId)
    .eq("user_id", ctx.userId)
    .maybeSingle()
  return data ? String(data.name) : null
}

function post(store: AgentStore, message: NewMessage) {
  return store.addMessage(message)
}

function say(store: AgentStore, content: string, kind: MessageKind, requestId: string | null) {
  return post(store, { thread: MASTER_KEY, sender: MASTER_KEY, recipient: "user", kind, content, requestId })
}

// Status is cosmetic: a failed write shouldn't fail the run
async function setAgent(store: AgentStore, task: AgentTaskRecord, status: "working" | "idle" | "error") {
  await store.setState(task.agentKey, status, status === "working" ? task.id : null).catch((error) => {
    console.error(`Could not set ${task.agentKey} to ${status}`, error)
  })
}

/**
 * Claims the task for this run (queued -> in_progress) and records the run. Re-running this step
 * after a crash resumes the same run instead of starting a second one.
 */
export async function startTask(ctx: RunContext): Promise<StartResult> {
  const store = storeFor(ctx)
  const task = await store.getTask(ctx.taskId)
  if (!task) return { action: "skip", reason: "Task no longer exists" }
  if (task.queuedAt !== ctx.queuedAt || task.scheduledAt !== ctx.scheduledAt) {
    return { action: "skip", reason: "A newer dispatch owns this task" }
  }

  const name = await campaignName(ctx)
  if (!name) return { action: "skip", reason: "Campaign no longer exists" }

  // Our own earlier attempt already claimed it: pick the same run back up
  if (task.status === "in_progress" || task.status === "in_review") {
    const run = await store.getRun(task.id, task.scheduledAt)
    if (!run || run.status !== "running") return { action: "skip", reason: "This occurrence already ran" }
    return { action: "run", task, runId: run.id, campaignName: name, inputs: await inputsFor(store, task) }
  }
  if (task.status !== "queued") return { action: "skip", reason: `Task is ${task.status}` }

  const request = await store.getRequest(task.requestId)
  if (request.status === "cancelled") {
    await store.transitionTask(task.id, ctx.queuedAt, "queued", { status: "cancelled", error: "The request was cancelled." })
    return { action: "skip", reason: "Request cancelled" }
  }

  // Paused agents keep their tasks; they're dispatched again when the agent resumes
  const states = await store.getStates()
  if (states[task.agentKey] === "paused") {
    await store.transitionTask(task.id, ctx.queuedAt, "queued", { status: "pending", queuedAt: null })
    return { action: "deferred", reason: "Agent is paused", until: task.scheduledAt }
  }

  // Work it depends on must be finished first
  const deps = await store.listTasksByIds(task.dependsOn)
  const broken = deps.find((d) => d.status === "failed" || d.status === "blocked" || d.status === "cancelled")
  if (broken) {
    const reason = `Skipped because "${broken.title}" did not finish.`
    const blocked = await store.transitionTask(task.id, ctx.queuedAt, "queued", { status: "blocked", error: reason })
    if (blocked) await finishRequestIfSettled(store, task.requestId, name)
    return { action: "blocked", reason }
  }
  const waitingOn = deps.filter((d) => !(d.status === "completed" || (d.repeatRule && d.runCount > 0)))
  if (waitingOn.length > 0) {
    const until = Date.now() + DEPENDENCY_RECHECK_MS
    await store.transitionTask(task.id, ctx.queuedAt, "queued", { status: "pending", queuedAt: null, scheduledAt: until })
    return { action: "deferred", reason: `Waiting for "${waitingOn[0].title}"`, until }
  }

  const started = await store.transitionTask(task.id, ctx.queuedAt, "queued", {
    status: "in_progress",
    attempts: task.attempts + 1,
    startedAt: Date.now(),
    error: null,
  })
  if (!started) return { action: "skip", reason: "Task was claimed elsewhere" }

  // The unique (task, occurrence) key: if a run exists this occurrence has already executed
  const run = await store.createRun(started)
  if (!run) {
    // Move past the occurrence that already ran instead of leaving the task stuck
    const next = started.repeatRule ? nextOccurrence(started.repeatRule, started.scheduledAt, started.runCount, Date.now()) : null
    await store.transitionTask(task.id, ctx.queuedAt, "in_progress", next ? { status: "pending", scheduledAt: next, queuedAt: null } : { status: "completed" })
    return { action: "skip", reason: "This occurrence already ran" }
  }

  await setAgent(store, started, "working")
  await post(store, {
    thread: started.agentKey,
    sender: MASTER_KEY,
    recipient: started.agentKey,
    kind: "assignment",
    content:
      started.runCount > 0
        ? `Scheduled run #${started.runCount + 1}: ${started.title}`
        : started.clarifications
          ? `Back to "${started.title}" with the details you needed.`
          : `New task: ${started.title}\n\n${started.instructions}`,
    requestId: started.requestId,
    taskId: started.id,
  })

  return { action: "run", task: started, runId: run.id, campaignName: name, inputs: await inputsFor(store, started) }
}

async function inputsFor(store: AgentStore, task: AgentTaskRecord): Promise<TaskInput[]> {
  const deps = await store.listTasksByIds(task.dependsOn)
  return deps
    .filter((d) => d.output)
    .map((d) => ({ agentName: ROLES[d.agentKey].name, title: d.title, output: d.output! }))
}

/** One attempt by the agent. Returns its work, or the question it needs answered. */
export async function runAgent(
  task: AgentTaskRecord,
  campaign: string,
  inputs: TaskInput[],
  clarifications: string | null,
  feedback: string | null
): Promise<AgentAttempt> {
  const output = await completeText(
    [
      { role: "system", content: taskSystemPrompt(task.agentKey, campaign) },
      { role: "user", content: taskPrompt({ title: task.title, instructions: task.instructions, inputs, clarifications, feedback }) },
    ],
    { temperature: 0.6 }
  )
  if (!output) throw new Error(`The ${ROLES[task.agentKey].name} returned an empty answer.`)

  const firstLine = output.trim().split("\n")[0]?.trim() ?? ""
  if (firstLine.toUpperCase().startsWith(QUESTION_PREFIX)) {
    const question = firstLine.slice(QUESTION_PREFIX.length).trim()
    if (question) return { kind: "question" as const, question }
  }
  return { kind: "output" as const, output }
}

/** The agent asked the Master Agent something; it answers if it can. */
export async function answerQuestion(ctx: RunContext, task: AgentTaskRecord, campaign: string, inputs: TaskInput[], question: string) {
  const store = storeFor(ctx)
  const meta = { requestId: task.requestId, taskId: task.id }
  await post(store, { thread: task.agentKey, sender: task.agentKey, recipient: MASTER_KEY, kind: "question", content: question, ...meta })

  // The user only gets asked once per task: after that the agent works from assumptions
  if (task.clarifications?.includes("A (from the user):")) {
    const answer = "There are no more details available from the user. Go ahead with sensible assumptions, state them briefly, and deliver the work."
    await post(store, { thread: task.agentKey, sender: MASTER_KEY, recipient: task.agentKey, kind: "answer", content: answer, ...meta })
    return { answered: true as const, note: `Q: ${question}\nA (from the Master Agent): ${answer}` }
  }

  const request = await store.getRequest(task.requestId)
  const verdict = await answerAgentQuestion({
    campaignName: campaign,
    request,
    task,
    question,
    context: inputs.map((i) => `Work from the ${i.agentName}:\n${i.output}`).join("\n\n"),
  }).catch(() => null)

  if (verdict?.canAnswer && verdict.answer.trim()) {
    const answer = verdict.answer.trim()
    await post(store, { thread: task.agentKey, sender: MASTER_KEY, recipient: task.agentKey, kind: "answer", content: answer, ...meta })
    return { answered: true as const, note: `Q: ${question}\nA (from the Master Agent): ${answer}` }
  }
  return { answered: false as const, forUser: verdict?.questionForUser.trim() || question }
}

/** Only the user can answer: park the task and ask them in the Master Agent chat. */
export async function needsInput(ctx: RunContext, task: AgentTaskRecord, runId: string, clarifications: string | null, forUser: string) {
  const store = storeFor(ctx)
  const notes = clarifications ? `${clarifications}\nQ: ${forUser}` : `Q: ${forUser}`
  const parked = await store.transitionTask(task.id, ctx.queuedAt, "in_progress", { status: "needs_input" })
  if (!parked) return
  await store.updateTask(task.id, { clarifications: notes })
  await store.finishRun(runId, "needs_input", { error: forUser })

  const name = ROLES[task.agentKey].name
  const request = await store.getRequest(task.requestId)
  const question = request.clarificationQuestion ? `${request.clarificationQuestion}\n${name}: ${forUser}` : `${name}: ${forUser}`
  await store.transitionRequest(task.requestId, ["running", "awaiting_clarification"], {
    status: "awaiting_clarification",
    clarificationQuestion: question,
  })
  await say(store, `The ${name} needs one detail from you before it can finish "${task.title}".\n\n${forUser}`, "clarification", task.requestId)
  await setAgent(store, task, "idle")
}

/** Posts the work to the Master Agent and returns its review. A failed review approves the work. */
export async function reviewWork(
  ctx: RunContext,
  task: AgentTaskRecord,
  campaign: string,
  output: string,
  canRevise: boolean
): Promise<ReviewResult> {
  const store = storeFor(ctx)
  const meta = { requestId: task.requestId, taskId: task.id }
  await post(store, { thread: task.agentKey, sender: task.agentKey, recipient: MASTER_KEY, kind: "result", content: output, ...meta })
  await store.transitionTask(task.id, ctx.queuedAt, "in_progress", { status: "in_review" })

  const review = await reviewOutput({ campaignName: campaign, task, output }).catch(() => ({ approved: true, feedback: "" }))
  const feedback = review.feedback.trim()
  if (!review.approved && feedback && canRevise) {
    await post(store, { thread: task.agentKey, sender: MASTER_KEY, recipient: task.agentKey, kind: "review", content: `Please revise: ${feedback}`, ...meta })
    await store.transitionTask(task.id, ctx.queuedAt, "in_review", { status: "in_progress" })
    return { revise: true as const, feedback }
  }
  await post(store, {
    thread: task.agentKey,
    sender: MASTER_KEY,
    recipient: task.agentKey,
    kind: "review",
    content: review.approved ? "Approved. Thanks!" : `Accepted. Note for next time: ${feedback}`,
    ...meta,
  })
  return { revise: false as const, feedback: review.approved ? null : feedback || null }
}

/**
 * Saves the result. One-off tasks become completed; repeating tasks go back to pending at their
 * next occurrence in the same update, so the task is never both done and waiting.
 */
export async function completeTask(
  ctx: RunContext,
  task: AgentTaskRecord,
  runId: string,
  campaign: string,
  output: string,
  feedback: string | null
) {
  const store = storeFor(ctx)
  const now = Date.now()
  const runCount = task.runCount + 1
  const next = task.repeatRule ? nextOccurrence(task.repeatRule, task.scheduledAt, runCount, now) : null
  const common = { output, reviewFeedback: feedback, runCount, lastRunAt: now, completedAt: now, error: null }

  await store.finishRun(runId, "completed", { output })
  const saved = await store.transitionTask(task.id, ctx.queuedAt, ["in_progress", "in_review"], next
    ? { ...common, status: "pending", scheduledAt: next, nextRunAt: nextOccurrence(task.repeatRule!, next, runCount, next), queuedAt: null }
    : { ...common, status: "completed", nextRunAt: null })
  await setAgent(store, task, "idle")
  if (!saved) return { next: null }

  // The next occurrence may already be due (e.g. hourly tasks that ran late)
  if (next) await dispatchDueTasks(store, [saved])
  await finishRequestIfSettled(store, task.requestId, campaign)
  return { next }
}

/** After all retries failed. Repeating tasks still move on to their next occurrence. */
export async function failTask(ctx: RunContext, message: string) {
  const store = storeFor(ctx)
  const task = await store.getTask(ctx.taskId)
  if (!task || task.queuedAt !== ctx.queuedAt || TERMINAL.includes(task.status)) return

  const run = await store.getRun(task.id, task.scheduledAt)
  if (run?.status === "running") await store.finishRun(run.id, "failed", { error: message })

  const now = Date.now()
  const runCount = task.runCount + 1
  const next = task.repeatRule && run ? nextOccurrence(task.repeatRule, task.scheduledAt, runCount, now) : null
  const saved = await store.transitionTask(task.id, ctx.queuedAt, ["queued", "in_progress", "in_review"], next
    ? {
        status: "pending",
        scheduledAt: next,
        nextRunAt: nextOccurrence(task.repeatRule!, next, runCount, next),
        runCount,
        lastRunAt: now,
        queuedAt: null,
        error: message,
      }
    : { status: "failed", error: message })
  if (!saved) return

  await post(store, {
    thread: task.agentKey,
    sender: task.agentKey,
    recipient: MASTER_KEY,
    kind: "error",
    content: `I couldn't finish "${task.title}": ${message}${next ? " I'll try again at the next scheduled run." : ""}`,
    requestId: task.requestId,
    taskId: task.id,
  }).catch(() => undefined)
  await setAgent(store, task, "error")

  const name = await campaignName(ctx)
  if (name) await finishRequestIfSettled(store, task.requestId, name)
}

/**
 * Once every task has finished (repeating ones after their first run), the Master Agent reports
 * back once. The running -> completed transition decides which caller writes the summary.
 */
export async function finishRequestIfSettled(store: AgentStore, requestId: string, campaign: string) {
  const tasks = await store.listTasks(requestId)
  const settled = tasks.every((t) => TERMINAL.includes(t.status) || (t.repeatRule && t.runCount > 0 && t.status === "pending"))
  if (!settled || tasks.length === 0) return

  const delivered = tasks.filter((t) => t.output && (t.status === "completed" || t.repeatRule))
  if (delivered.length === 0) {
    const failed = await store.transitionRequest(requestId, ["running"], { status: "failed", error: "No task finished." })
    if (!failed) return
    const reasons = tasks.map((t) => `- ${ROLES[t.agentKey].name}: ${t.error ?? "no result"}`).join("\n")
    await say(store, `The team couldn't complete this request.\n\n${reasons}\n\nYou can ask me to try again.`, "error", requestId)
    return
  }

  const claimed = await store.transitionRequest(requestId, ["running"], { status: "completed" })
  if (!claimed) return
  const summary = await summarize({ campaignName: campaign, request: claimed, tasks }).catch((error) => {
    console.error("Master Agent summary failed", error)
    return delivered.map((t) => `${ROLES[t.agentKey].name} - ${t.title}:\n${t.output}`).join("\n\n")
  })
  const unfinished = tasks.filter((t) => t.status === "failed" || t.status === "blocked").length
  await store.updateRequest(requestId, {
    summary: summary || "Done.",
    error: unfinished > 0 ? `${unfinished} task(s) did not finish.` : null,
  })
  const repeating = tasks.filter((t) => t.repeatRule && t.status === "pending").length
  const note = repeating ? `\n\n${repeating === 1 ? "1 task repeats" : `${repeating} tasks repeat`} on schedule; I'll keep the team on it.` : ""
  await say(store, `${summary || "All done."}${note}`, "summary", requestId)
}
