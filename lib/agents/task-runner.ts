import "server-only"
import { MASTER_KEY, isComputerAgent, type ComputerAgentKey } from "@/lib/agent-roles"
import { QUESTION_PREFIX, ROLES, taskPrompt, taskSystemPrompt } from "@/lib/ai/agents"
import { Agent, run } from "@openai/agents"
import { chatModel, isModelUnavailable } from "@/lib/ai/client"
import { completeText } from "@/lib/ai/llm"
import { analyticsTools, performanceSummary } from "@/lib/agents/tools/analytics"
import { scheduledForRequest, schedulerTools } from "@/lib/agents/tools/scheduler"
import { answerAgentQuestion, reviewOutput, summarize } from "@/lib/ai/master"
import { dispatchDueTasks } from "@/lib/agents/dispatch"
import { OutputStore } from "@/lib/agents/outputs"
import { nextOccurrence } from "@/lib/agents/schedule"
import { AgentStore, type NewMessage } from "@/lib/agents/store"
import { TERMINAL_TASK_STATUSES, type AgentTaskRecord, type MessageKind } from "@/lib/agents/types"
import { runComputerSlice, type SliceOutcome } from "@/lib/computers/agent"
import { ComputerStore } from "@/lib/computers/store"
import { getInsForgeAdmin } from "@/lib/insforge/admin"

/*
 * The steps of one task run, called from the Inngest executor (lib/inngest/functions.ts).
 * Every state change is conditional on the dispatch (queuedAt) that owns the run, so a retried
 * or duplicated step can never run a task twice or overwrite someone else's change.
 */

// If a task it depends on isn't finished yet, check again this much later
const DEPENDENCY_RECHECK_MS = 10 * 60 * 1000
// If the agent's computer is busy with another task, check again this much later
const COMPUTER_BUSY_RECHECK_MS = 2 * 60 * 1000
// A task waiting for the user (login, captcha, take over) expires after this long
export const USER_WAIT_MS = 24 * 60 * 60 * 1000
const TERMINAL = TERMINAL_TASK_STATUSES

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

async function loadCampaign(ctx: Pick<RunContext, "campaignId" | "userId">) {
  const { data } = await getInsForgeAdmin()
    .database.from("campaign")
    .select("name, status")
    .eq("id", ctx.campaignId)
    .eq("user_id", ctx.userId)
    .maybeSingle()
  return data ? { name: String(data.name), active: (data.status ?? "active") === "active" } : null
}

async function campaignName(ctx: Pick<RunContext, "campaignId" | "userId">) {
  return (await loadCampaign(ctx))?.name ?? null
}

export function computersFor(ctx: Pick<RunContext, "campaignId" | "userId">) {
  return new ComputerStore(ctx.campaignId, ctx.userId)
}

// Frees the agent's computer when its task stops using it. Cosmetic for other agents
async function releaseComputer(ctx: Pick<RunContext, "campaignId" | "userId">, task: AgentTaskRecord) {
  if (!isComputerAgent(task.agentKey)) return
  await computersFor(ctx)
    .release(task.agentKey, task.id)
    .catch((error) => console.error(`Could not free the ${task.agentKey} computer`, error))
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

  const campaign = await loadCampaign(ctx)
  if (!campaign) return { action: "skip", reason: "Campaign no longer exists" }
  const name = campaign.name

  // Our own earlier attempt already claimed it: pick the same run back up
  if (task.status === "in_progress" || task.status === "in_review") {
    const run = await store.getRun(task.id, task.scheduledAt)
    if (!run || run.status !== "running") return { action: "skip", reason: "This occurrence already ran" }
    return { action: "run", task, runId: run.id, campaignName: name, inputs: await inputsFor(store, task) }
  }
  if (task.status !== "queued") return { action: "skip", reason: `Task is ${task.status}` }

  if (!campaign.active) {
    await store.transitionTask(task.id, ctx.queuedAt, "queued", { status: "cancelled", error: "The campaign has ended." })
    return { action: "skip", reason: "Campaign ended" }
  }

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

  // Each agent runs one task at a time on its computer
  if (isComputerAgent(task.agentKey)) {
    const holder = await computersFor(ctx).acquire(task.agentKey, task.id)
    if (holder !== task.id) {
      const until = Date.now() + COMPUTER_BUSY_RECHECK_MS
      await store.transitionTask(task.id, ctx.queuedAt, "queued", { status: "pending", queuedAt: null, scheduledAt: until })
      return { action: "deferred", reason: "The agent's computer is busy with another task", until }
    }
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
    await releaseComputer(ctx, started)
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

// The Analytics and Scheduler Agents may call a few tools before writing
const TOOL_MAX_TURNS = 8

/** Runs a task with tools; returns the final text, or null if the model couldn't run them. */
async function runWithTools(name: string, system: string, prompt: string, tools: ReturnType<typeof schedulerTools>) {
  try {
    const agent = new Agent({ name, model: chatModel(), modelSettings: { temperature: 0.3 }, instructions: system, tools })
    const result = await run(agent, prompt, { maxTurns: TOOL_MAX_TURNS })
    const text = typeof result.finalOutput === "string" ? result.finalOutput.trim() : ""
    return text || null
  } catch (error) {
    console.error(`The ${name}'s tool run failed`, error)
    return null
  }
}

/** The Scheduler Agent's attempt: it can schedule the team's drafts to publish. */
async function runSchedulerAgent(ctx: RunContext, task: AgentTaskRecord, system: string, prompt: string) {
  const timeZone = task.instructions.match(/time zone: ([A-Za-z_]+(?:\/[A-Za-z_+-]+)*)/)?.[1] ?? "UTC"
  const now = new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "full", timeStyle: "short" }).format(Date.now())
  const withTime = `${prompt}\n\nRight now it is ${now} in the user's time zone (${timeZone}).`
  const log: string[] = []
  const tools = schedulerTools({ userId: ctx.userId, campaignId: ctx.campaignId, requestId: task.requestId, log })
  const text = await runWithTools(ROLES.scheduler.name, system, withTime, tools)
  if (!text) {
    // No tool run: a plan is still useful, but it must not read as if anything was scheduled
    const plan = await completeText([{ role: "system", content: system }, { role: "user", content: withTime }], { temperature: 0.4 })
    return `${plan}\n\n(Nothing was scheduled automatically. Schedule the draft on the Posts page.)`
  }
  // What the tool really did leads, whatever the model wrote
  return log.length ? `${log.join("\n")}\n\n${text}` : text
}

/**
 * The Analytics Agent's attempt: it gets the campaign's real headline numbers up front and its
 * analytics tools for anything else. If the model can't call tools, it still answers from the
 * numbers it was given.
 */
async function runAnalyticsAgent(ctx: RunContext, campaign: string, system: string, prompt: string) {
  const scope = { userId: ctx.userId, campaignId: ctx.campaignId, campaignName: campaign }
  const summary = await performanceSummary(scope).catch((error) => {
    console.error("Could not load the analytics summary for a task", error)
    return "The analytics data couldn't be loaded right now."
  })
  const withData = `${prompt}\n\nThe campaign's real numbers for the last 30 days:\n${summary}`
  const text = await runWithTools(ROLES.analytics.name, system, withData, analyticsTools(scope))
  if (text) return text
  return completeText([{ role: "system", content: system }, { role: "user", content: withData }], { temperature: 0.4 })
}

/** One attempt by the agent. Returns its work, or the question it needs answered. */
export async function runAgent(
  task: AgentTaskRecord,
  campaign: string,
  inputs: TaskInput[],
  clarifications: string | null,
  feedback: string | null,
  ctx?: RunContext
): Promise<AgentAttempt> {
  const system = taskSystemPrompt(task.agentKey, campaign)
  const prompt = taskPrompt({ title: task.title, instructions: task.instructions, inputs, clarifications, feedback })
  const output =
    task.agentKey === "analytics" && ctx
      ? await runAnalyticsAgent(ctx, campaign, system, prompt)
      : task.agentKey === "scheduler" && ctx
        ? await runSchedulerAgent(ctx, task, system, prompt)
        : await completeText(
          [
            { role: "system", content: system },
            { role: "user", content: prompt },
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
  await releaseComputer(ctx, task)
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

  const evidence = isComputerAgent(task.agentKey)
    ? await computerEvidence(ctx, task)
    : task.agentKey === "analytics"
      ? await performanceSummary({ userId: ctx.userId, campaignId: ctx.campaignId, campaignName: campaign }).catch(() => null)
      : task.agentKey === "scheduler"
        ? await scheduledForRequest({ userId: ctx.userId, campaignId: ctx.campaignId, requestId: task.requestId }).catch(() => null)
        : null
  // Reviewed against the latest instructions, which include details the user added mid-task,
  // and the user's own words (e.g. "don't search the web")
  const [latest, request] = await Promise.all([store.getTask(task.id).catch(() => null), store.getRequest(task.requestId).catch(() => null)])
  const review = await reviewOutput({ campaignName: campaign, task: latest ?? task, output, evidence, userRequest: request?.prompt ?? null }).catch(() => ({ approved: true, feedback: "" }))
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
  // The searchable record of this result. Best effort: it never blocks completing the task
  await saveTaskResult(ctx, store, task, runId, output, feedback).catch((error) => console.error("Could not save the task result", error))
  const saved = await store.transitionTask(task.id, ctx.queuedAt, ["in_progress", "in_review"], next
    ? { ...common, status: "pending", scheduledAt: next, nextRunAt: nextOccurrence(task.repeatRule!, next, runCount, next), queuedAt: null }
    : { ...common, status: "completed", nextRunAt: null })
  await setAgent(store, task, "idle")
  await releaseComputer(ctx, task)
  if (!saved) return { next: null }

  // The next occurrence may already be due (e.g. hourly tasks that ran late)
  if (next) await dispatchDueTasks(store, [saved])
  await finishRequestIfSettled(store, task.requestId, campaign)
  return { next }
}

// First paragraph of the output, which agents write as their summary
function summaryOf(output: string) {
  const first = output.trim().split(/\n\s*\n/)[0]?.trim() ?? ""
  return (first.length > 20 ? first : output.trim()).slice(0, 600)
}

/**
 * Saves one record per finished occurrence with everything it produced: the output, the images,
 * files and sources, and the findings and drafts saved during this run. Found later by search.
 */
async function saveTaskResult(ctx: RunContext, store: AgentStore, task: AgentTaskRecord, runId: string, output: string, feedback: string | null) {
  const outputs = OutputStore.admin(ctx.campaignId, ctx.userId)
  // Repeating tasks reuse the same id: only what this run made counts
  const since = task.startedAt ?? 0
  const recent = <T extends { createdAt: number }>(items: T[]) => items.filter((i) => i.createdAt >= since - 1000)
  const [artifacts, findings, drafts, request] = await Promise.all([
    isComputerAgent(task.agentKey) ? computersFor(ctx).listTaskArtifacts(task.id).then(recent) : Promise.resolve([]),
    task.agentKey === "research" ? outputs.listTaskFindings(task.id).then(recent) : Promise.resolve([]),
    task.agentKey === "creator" ? outputs.listTaskDrafts(task.id).then(recent) : Promise.resolve([]),
    store.getRequest(task.requestId).catch(() => null),
  ])
  const urls = (kind: string) => [...new Set(artifacts.filter((a) => a.kind === kind).map((a) => a.url))]
  const sources = new Set([...urls("link"), ...findings.flatMap((f) => f.sources.map((s) => s.url))])
  await outputs.saveTaskResult({
    requestId: task.requestId,
    taskId: task.id,
    runId,
    agentKey: task.agentKey,
    taskTitle: task.title,
    requestPrompt: request?.prompt ?? null,
    summary: summaryOf(output),
    output,
    reviewFeedback: feedback,
    imageUrls: [...new Set([...urls("image"), ...drafts.flatMap((d) => d.imageUrls)])],
    fileUrls: urls("file"),
    sourceUrls: [...sources],
    findingIds: findings.map((f) => f.id),
    draftIds: drafts.map((d) => d.id),
    usedBrowser: artifacts.some((a) => a.kind === "page"),
  })
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
  await releaseComputer(ctx, task)
  const saved = await store.transitionTask(task.id, ctx.queuedAt, ["queued", "in_progress", "in_review", "waiting_for_user"], next
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
  const unfinished = tasks.filter((t) => t.status === "failed" || t.status === "blocked" || t.status === "expired").length
  await store.updateRequest(requestId, {
    summary: summary || "Done.",
    error: unfinished > 0 ? `${unfinished} task(s) did not finish.` : null,
  })
  const repeating = tasks.filter((t) => t.repeatRule && t.status === "pending").length
  const note = repeating ? `\n\n${repeating === 1 ? "1 task repeats" : `${repeating} tasks repeat`} on schedule; I'll keep the team on it.` : ""
  await say(store, `${summary || "All done."}${note}`, "summary", requestId)
}

// ---- Computer agents (Research, Creator): their own desktop ----

/** What the agent's computer log shows, so the Master Agent can check the work was really done. */
async function computerEvidence(ctx: RunContext, task: AgentTaskRecord) {
  const outputs = OutputStore.admin(ctx.campaignId, ctx.userId)
  const since = (task.startedAt ?? 0) - 1000
  const [artifacts, findings, drafts] = await Promise.all([
    computersFor(ctx).listTaskArtifacts(task.id).catch(() => []),
    task.agentKey === "research" ? outputs.listTaskFindings(task.id).catch(() => []) : Promise.resolve([]),
    task.agentKey === "creator" ? outputs.listTaskDrafts(task.id).catch(() => []) : Promise.resolve([]),
  ])
  const pages = artifacts.filter((a) => a.kind === "page")
  const files = artifacts.filter((a) => a.kind === "image" || a.kind === "file")
  const lines = [
    pages.length
      ? `Pages the agent actually opened or got from a web search:\n${pages.map((p) => `- ${p.url}`).join("\n")}`
      : "The agent's log shows it did not search the web or open any web pages.",
    files.length ? `Files it made and uploaded:\n${files.map((f) => `- ${f.name}: ${f.url}`).join("\n")}` : "It uploaded no files.",
  ]
  const newFindings = findings.filter((f) => f.createdAt >= since)
  if (task.agentKey === "research") {
    lines.push(
      newFindings.length
        ? `Research findings it saved to the database:\n${newFindings.map((f) => `- [${f.kind}, ${f.basis}] ${f.title}`).join("\n")}`
        : "It saved no research findings to the database."
    )
  }
  const newDrafts = drafts.filter((d) => d.createdAt >= since)
  if (task.agentKey === "creator") {
    lines.push(
      newDrafts.length
        ? `Content drafts it saved to the database:\n${newDrafts.map((d) => `- ${d.format} for ${d.platform}: ${d.title}${d.imageUrls.length ? ` (${d.imageUrls.length} image${d.imageUrls.length === 1 ? "" : "s"})` : ""}`).join("\n")}`
        : "It saved no content drafts to the database."
    )
  }
  return lines.join("\n\n")
}

export type ComputerStep = SliceOutcome | { kind: "stopped"; reason: string }

/**
 * Runs the agent on its computer for one background step (a few minutes). Stops instead if the
 * task was cancelled or the campaign ended in the meantime.
 */
export async function computerSlice(
  ctx: RunContext,
  task: AgentTaskRecord,
  campaign: string,
  inputs: TaskInput[],
  clarifications: string | null,
  feedback: string | null,
  attempt: number
): Promise<ComputerStep> {
  const store = storeFor(ctx)
  const [current, info] = await Promise.all([store.getTask(task.id), loadCampaign(ctx)])
  if (!info?.active) return { kind: "stopped", reason: "The campaign has ended." }
  if (!current || current.queuedAt !== ctx.queuedAt || !["in_progress", "in_review"].includes(current.status)) {
    return { kind: "stopped", reason: `The task is ${current?.status.replace("_", " ") ?? "gone"}.` }
  }
  // The fresh copy carries details the user added after the task started
  try {
    return await runComputerSlice({ computers: computersFor(ctx), agents: store, task: current, campaignName: campaign, attempt, inputs, clarifications, feedback })
  } catch (error) {
    // The step is retried; meanwhile say why the agent is stalled instead of its last action
    if (isModelUnavailable(error)) {
      await store.setActivity(task.agentKey, "The AI model is busy right now. Retrying shortly…").catch(() => undefined)
    }
    throw error
  }
}

/**
 * The agent is waiting for the user: a login or captcha it asked for help with, or the user took
 * over its computer. The task becomes "Waiting for you" until they click Done / Hand back.
 */
export async function startWaitingForUser(ctx: RunContext, task: AgentTaskRecord, outcome: { kind: "needs_user"; reason: string; url: string | null } | { kind: "takeover" }) {
  const store = storeFor(ctx)
  const until = Date.now() + USER_WAIT_MS
  const reason = outcome.kind === "needs_user" ? outcome.reason : "You took over the computer. The agent continues when you hand it back."
  const waiting = await store.transitionTask(task.id, ctx.queuedAt, ["in_progress", "in_review"], {
    status: "waiting_for_user",
    waitingReason: reason,
    waitingUrl: outcome.kind === "needs_user" ? outcome.url : null,
    waitingUntil: until,
  })
  if (!waiting) return { waiting: false as const }

  const activity = outcome.kind === "needs_user" ? "Waiting for you to log in" : "Waiting for you to hand back control"
  await computersFor(ctx).update(task.agentKey as ComputerAgentKey, { activity }).catch(() => undefined)
  await store.setActivity(task.agentKey, activity).catch(() => undefined)

  if (outcome.kind === "needs_user") {
    const name = ROLES[task.agentKey].name
    const where = outcome.url ? ` (${new URL(outcome.url).hostname.replace(/^www\./, "")})` : ""
    await post(store, { thread: task.agentKey, sender: task.agentKey, recipient: MASTER_KEY, kind: "question", content: `I need the user's help: ${outcome.reason}`, requestId: task.requestId, taskId: task.id })
    await say(
      store,
      `The ${name} needs your help on its computer${where} to continue "${task.title}":\n${outcome.reason}\n\nOpen its computer with "Login now", do it yourself (the agent never sees your password), then click "Done". If nobody responds within 24 hours, the task expires.`,
      "clarification",
      task.requestId
    )
  }
  return { waiting: true as const }
}

export type UserWaitStatus = "resolved" | "waiting" | "expired" | "stopped"

/** Whether the user clicked Done / Hand back (the routes move the task back to in_progress). */
export async function checkUserWait(ctx: RunContext, taskId: string): Promise<UserWaitStatus> {
  const [task, info] = await Promise.all([storeFor(ctx).getTask(taskId), loadCampaign(ctx)])
  if (!task || task.queuedAt !== ctx.queuedAt || !info?.active) return "stopped"
  if (task.status === "in_progress" || task.status === "in_review") return "resolved"
  if (task.status !== "waiting_for_user") return "stopped"
  return task.waitingUntil && task.waitingUntil <= Date.now() ? "expired" : "waiting"
}

/** Nobody responded within 24 hours. */
export async function expireTask(ctx: RunContext, task: AgentTaskRecord) {
  const store = storeFor(ctx)
  const expired = await store.transitionTask(task.id, ctx.queuedAt, "waiting_for_user", {
    status: "expired",
    error: "Nobody responded within 24 hours.",
    waitingUntil: null,
  })
  if (!expired) return
  const run = await store.getRun(task.id, task.scheduledAt)
  if (run?.status === "running") await store.finishRun(run.id, "failed", { error: "Expired while waiting for the user." })
  await computersFor(ctx).deleteRunState(task.id).catch(() => undefined)
  await computersFor(ctx).update(task.agentKey as ComputerAgentKey, { control: "agent" }).catch(() => undefined)
  await releaseComputer(ctx, task)
  await setAgent(store, task, "idle")
  await say(store, `"${task.title}" expired: the ${ROLES[task.agentKey].name} waited 24 hours for your help. Ask me again whenever you're ready.`, "update", task.requestId)
  const name = await campaignName(ctx)
  if (name) await finishRequestIfSettled(store, task.requestId, name)
}

/** The task was cancelled or the campaign ended while the agent worked: tidy up without failing it. */
export async function stopComputerTask(ctx: RunContext, task: AgentTaskRecord, reason: string) {
  const store = storeFor(ctx)
  await store.transitionTask(task.id, ctx.queuedAt, ["in_progress", "in_review", "waiting_for_user"], { status: "cancelled", error: reason })
  const run = await store.getRun(task.id, task.scheduledAt)
  if (run?.status === "running") await store.finishRun(run.id, "failed", { error: reason })
  await computersFor(ctx).deleteRunState(task.id).catch(() => undefined)
  await releaseComputer(ctx, task)
  await setAgent(store, task, "idle")
}
