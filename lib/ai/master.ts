import "server-only"
import { z } from "zod"
import { AGENT_KEYS, type AgentKey } from "@/lib/agent-roles"
import { ROLES, USER_UPDATE_PREFIX } from "@/lib/ai/agents"
export { USER_UPDATE_PREFIX }
import { completeJSON, completeText } from "@/lib/ai/llm"
import {
  DISPATCH_WINDOW_MS,
  MAX_SCHEDULE_AHEAD_MS,
  describeRepeat,
  formatWhen,
  repeatRuleSchema,
  zonedDate,
  zonedTimeToInstant,
} from "@/lib/agents/schedule"
import type { AgentMessage, AgentRequestRecord, AgentStates, AgentTaskRecord, RepeatRule } from "@/lib/agents/types"

export const MAX_TASKS_PER_PLAN = 6
// Spreading rules applied after the Master Agent plans
const MAX_TASKS_PER_AGENT_PER_DAY = 3
// A task starts at least this long after the work it depends on
const DEPENDENCY_GAP_MS = 30 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const STYLE = `Plain text for a chat window: short paragraphs and "-" bullet lists. No markdown headings, tables, bold or code blocks.`

function identity(campaignName: string) {
  return `You are the Master Agent, the coordinator of an AI social media marketing team working on the campaign "${campaignName}". You do not do the specialist work yourself: you plan it, assign it to your agents, track it and review the results.`
}

function teamList(states?: AgentStates) {
  return AGENT_KEYS.map((key) => {
    const paused = states?.[key] === "paused" ? " (currently paused by the user)" : ""
    return `- ${key}: ${ROLES[key].name}, handles ${ROLES[key].summary}${paused}`
  }).join("\n")
}

// ---- Deciding what to do with a user message ----

// When a task runs: "now", or a day offset and a local time. Easier for a small model than raw ISO dates
const runAtSchema = z.union([
  z.literal("now"),
  z.object({
    daysFromToday: z.coerce.number().int().min(0).max(90),
    time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "time must be HH:MM (24h)"),
  }),
])

const plannedTask = z.object({
  id: z.string().min(1).max(20),
  agent: z.enum(AGENT_KEYS),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(3000),
  dependsOn: z.array(z.string()).default([]),
  runAt: runAtSchema.default("now"),
  repeat: repeatRuleSchema.nullable().optional(),
})

// Extra details the user gave for a task that is already assigned
const taskUpdate = z.object({
  task: z.string().min(1).max(20),
  addition: z.string().trim().min(1).max(2000),
})

const ACTIONS = ["reply", "clarify", "plan", "resume", "update"] as const

/**
 * Small models sometimes return an action that isn't on the list: a different case, the whole
 * template ("reply | plan | ..."), or a word of their own like "research". Work out what they meant
 * from the rest of the answer instead of failing the turn.
 */
function normalizeDecision(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw
  const answer = { ...(raw as Record<string, unknown>) }
  const action = typeof answer.action === "string" ? answer.action.trim().toLowerCase() : ""
  const hasItems = (key: string) => Array.isArray(answer[key]) && (answer[key] as unknown[]).length > 0
  if ((ACTIONS as readonly string[]).includes(action)) answer.action = action
  else if (hasItems("updates")) answer.action = "update"
  else if (hasItems("tasks")) answer.action = "plan"
  else if (action.includes("clarif") || action.includes("question")) answer.action = "clarify"
  else answer.action = "reply"
  return answer
}

export const decisionSchema = z.preprocess(
  normalizeDecision,
  z.object({
    action: z.enum(ACTIONS),
    message: z.string().trim().min(1).max(3000),
    tasks: z.array(plannedTask).max(MAX_TASKS_PER_PLAN).default([]),
    updates: z.array(taskUpdate).max(MAX_TASKS_PER_PLAN * 2).default([]),
  })
)

export type Decision = z.infer<typeof decisionSchema>
export type PlannedTask = z.infer<typeof plannedTask>

// Short refs ("a1", "a2"...) for assigned tasks: easier for the model than database ids
export function activeTaskRefs(tasks: AgentTaskRecord[]) {
  return new Map(tasks.map((t, i) => [`a${i + 1}`, t]))
}

export async function decide({
  campaignName,
  history,
  message,
  openRequest,
  recentRequests,
  states,
  timeZone,
  upcoming,
  activeTasks = [],
  signal,
}: {
  campaignName: string
  history: AgentMessage[]
  message: string
  openRequest: (AgentRequestRecord & { hasTasks: boolean }) | null
  recentRequests: AgentRequestRecord[]
  states: AgentStates
  timeZone: string
  // Tasks already scheduled, so new work is spread around them
  upcoming: AgentTaskRecord[]
  // Tasks already assigned and not finished, which new details from the user can update
  activeTasks?: AgentTaskRecord[]
  signal?: AbortSignal
}): Promise<Decision> {
  const pending = openRequest
    ? openRequest.status === "awaiting_clarification"
      ? `\nYou are waiting for the user to answer this question about their request "${openRequest.prompt}": "${openRequest.clarificationQuestion ?? ""}". If the latest message answers it, use "resume"${openRequest.hasTasks ? "" : ' or "plan" the request now that you have the answer'}.`
      : `\nThe request "${openRequest.prompt}" is on hold because an agent is paused. If the user asks you to continue it, use "resume".`
    : ""

  const past = recentRequests
    .filter((r) => r.summary)
    .slice(0, 3)
    .map((r) => `- "${r.prompt}" (${r.status}): ${r.summary!.slice(0, 400)}`)
    .join("\n")

  const schedule = upcoming
    .slice(0, 20)
    .map((t) => `- ${formatWhen(t.scheduledAt, timeZone)}: ${t.agentKey}, "${t.title}"${t.repeatRule ? ` (${describeRepeat(t.repeatRule).toLowerCase()})` : ""}`)
    .join("\n")

  const refs = activeTaskRefs(activeTasks)
  const assigned = [...refs]
    .map(([ref, t]) => `- ${ref}: ${t.agentKey}, "${t.title}" (${t.status.replace(/_/g, " ")}). Instructions: ${t.instructions.slice(0, 600)}`)
    .join("\n")

  const system = `${identity(campaignName)}

Your agents (use these exact keys):
${teamList(states)}

Decide how to handle the user's latest message. Reply with only a JSON object:
{"action": "plan", "message": "...", "tasks": [{"id": "t1", "agent": "research", "title": "...", "instructions": "...", "dependsOn": [], "runAt": "now", "repeat": null}], "updates": [{"task": "a1", "addition": "..."}]}
"action" is exactly one of: "reply", "clarify", "plan", "resume", "update". "updates" is [] unless the action is "update".

- "reply": greetings, small talk, or questions about the team, its status or past work. "message" is your answer. "tasks" is [].
- "clarify": the user wants work done but it is too vague to plan and you cannot reasonably assume the missing detail. "message" is one short, specific question. "tasks" is []. Ask at most one clarifying question per request: once the user has answered, "plan" the work and fill any remaining gaps with reasonable assumptions.
- "plan": the user wants work done. "message" briefly tells the user your plan. "tasks" has 1 to ${MAX_TASKS_PER_PLAN} tasks in the order they should run, each for exactly one agent and only within that agent's area. Use only the agents the request needs. "dependsOn" lists the ids of earlier tasks whose output the task needs (for example the Creator writing posts about the Research Agent's ideas). Each task's "instructions" must be specific and self-contained, including the platform, goal and any details the user gave.
  Scheduling: you decide when each task runs. "runAt" is "now" or {"daysFromToday": 0-90, "time": "HH:MM"} in the user's local time (24h). Use "now" for work the user wants right away; otherwise spread tasks out sensibly: research first, content after the research it uses, posting-related work at good times for the platform (for example weekday mornings or evenings), and no more than ${MAX_TASKS_PER_AGENT_PER_DAY} tasks per agent per day. Avoid times already taken in the schedule below.
  "repeat" is null, or for recurring work (only when the user asks for it, e.g. "every Monday", "daily"): {"every": 1, "unit": "hour" | "day" | "week" | "month", "count": optional number of runs}. The first run happens at "runAt".
- "update": the user adds details, corrections or preferences (a product name, audience, tone, platform, date, link, "make it shorter"...) for work already assigned in "Tasks already assigned" below. Never create new tasks for this: "tasks" is [] and "updates" lists each assigned task the details affect, with its ref (for example "a1") and an "addition" that states the new details clearly and completely so the agent can act on them. "message" briefly tells the user which agents you passed the details to. Use "plan" only when the user asks for different, new work that no assigned task covers.
- "resume": only when you were waiting on the user (see below) and they answered or asked you to continue. "message" acknowledges it. "tasks" is [].
Agent tools: the Research Agent works from its own knowledge first and uses its computer's web browser (Google, YouTube, Instagram, TikTok, X, LinkedIn and other platforms) when live or in-depth research is needed; it saves each finding with its sources to the database. The Creator Agent writes posts, captions, hashtags and content ideas, generates images (Gemini), transforms them (ImageKit: background removal, resizing for a platform, text overlays...), turns images into short slideshow videos (MP4 with captions) for Reels, TikTok and YouTube Shorts, and saves every piece as a draft in the database. They pick their own tools: describe the outcome you want (platform, format, number of posts, whether images are needed), not which tools to use.
Using the web: when a task needs live information (what is trending now, recent news, a competitor's latest posts, current platform changes), say so in its instructions, e.g. "Check the web for what is trending this week." If the user says not to browse or to use only what the agents already know, write "Do not use the browser for this task." in the instructions of the affected tasks. If a site needs the user to log in, the agent asks the user itself.
Scope: any request about social media content, trends, hashtags, platforms, posting, competitors or audiences is in scope and should be planned, even if its topic differs from the campaign's name (for example football trends on Instagram for any campaign). Only refuse requests that are clearly not social media marketing, such as writing code, homework or general trivia: then use "reply" and say in one sentence that you only help with this campaign's social media. If the user pushes back on a refusal, re-evaluate the request and plan it if it is in scope instead of repeating yourself.${pending}${past ? `\n\nRecent work by the team:\n${past}` : ""}

Current time for the user: ${new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "full", timeStyle: "short" }).format(Date.now())} (${timeZone}).
Already scheduled:
${schedule || "- nothing"}${assigned ? `\n\nTasks already assigned (not finished yet):\n${assigned}` : ""}`

  const conversation = history
    .filter((m) => !m.error && (m.sender === "user" || m.sender === "master"))
    // Drop past refusals so the model doesn't copy them on the next turn
    .filter((m) => !(m.sender === "master" && /only help with this campaign's social media/i.test(m.content)))
    .slice(-10)
    .map((m) => ({ role: m.sender === "user" ? ("user" as const) : ("assistant" as const), content: m.content }))

  const decision = await completeJSON(
    decisionSchema,
    [{ role: "system", content: system }, ...conversation, { role: "user", content: message }],
    { signal }
  )
  if (decision.action === "resume" && !openRequest) return { ...decision, action: "reply" }
  if (decision.action === "update") {
    const updates = decision.updates.filter((u) => refs.has(u.task))
    // Nothing valid to update: plan the work instead if the model also gave tasks
    if (updates.length === 0) return {
      ...decision,
      action: decision.tasks.length > 0 ? "plan" : "reply",
      message: decision.tasks.length > 0
        ? "I couldn't match those details to an assigned task. I'll plan the work instead."
        : "I couldn't match those details to an assigned task. Please tell me which task you meant.",
      updates: [],
    }
    return { ...decision, tasks: [], updates }
  }
  return decision
}

/**
 * Checks and schedules a plan:
 * - unknown dependency ids are dropped and dependencies on the same or a later task removed (no cycles)
 * - "runAt" becomes an instant in the user's time zone; past times run now, far-future times are capped
 * - a task starts at least 30 minutes after the tasks it depends on
 * - an agent gets at most 3 tasks per day, counting what is already scheduled; extras move to the next day
 */
export function normalizePlan(
  tasks: PlannedTask[],
  { timeZone, upcoming, now = Date.now() }: { timeZone: string; upcoming: AgentTaskRecord[]; now?: number }
) {
  const unique = tasks.slice(0, MAX_TASKS_PER_PLAN)
  const indexById = new Map<string, number>()
  unique.forEach((t, i) => {
    if (!indexById.has(t.id)) indexById.set(t.id, i)
  })

  const today = zonedDate(now, timeZone)
  const dayKey = (instant: number) => {
    const d = zonedDate(instant, timeZone)
    return `${d.year}-${d.month}-${d.day}`
  }
  // Tasks per agent per local day, including the existing schedule
  const load = new Map<string, number>()
  for (const t of upcoming) {
    const key = `${t.agentKey}:${dayKey(t.scheduledAt)}`
    load.set(key, (load.get(key) ?? 0) + 1)
  }

  const scheduled: number[] = []
  return unique.map((task, i) => {
    const dependsOn = [...new Set(task.dependsOn.map((id) => indexById.get(id)).filter((d): d is number => d !== undefined && d < i))]

    let at = now
    if (task.runAt !== "now") {
      const [hours, minutes] = task.runAt.time.split(":").map(Number)
      const day = new Date(Date.UTC(today.year, today.month, today.day + task.runAt.daysFromToday))
      at = zonedTimeToInstant({ year: day.getUTCFullYear(), month: day.getUTCMonth(), day: day.getUTCDate() }, hours, minutes, timeZone)
    }
    at = Math.min(Math.max(at, now), now + MAX_SCHEDULE_AHEAD_MS)
    for (const d of dependsOn) at = Math.max(at, scheduled[d] + DEPENDENCY_GAP_MS)
    // Work due right away doesn't count against the daily spread
    if (at > now + DISPATCH_WINDOW_MS) {
      for (let guard = 0; guard < 90 && (load.get(`${task.agent}:${dayKey(at)}`) ?? 0) >= MAX_TASKS_PER_AGENT_PER_DAY; guard++) at += DAY_MS
    }
    const key = `${task.agent}:${dayKey(at)}`
    load.set(key, (load.get(key) ?? 0) + 1)
    scheduled.push(at)

    return {
      agentKey: task.agent as AgentKey,
      title: task.title,
      // The Scheduler turns "6 PM today" into a real time, so it needs the user's zone
      instructions: task.agent === "scheduler" && !task.instructions.includes("time zone:") ? `${task.instructions}\n(The user's time zone: ${timeZone}.)` : task.instructions,
      position: i,
      dependsOn,
      scheduledAt: at,
      repeatRule: (task.repeat ?? null) as RepeatRule | null,
    }
  })
}

export function describePlan(
  message: string,
  tasks: { agentKey: AgentKey; title: string; scheduledAt: number; repeatRule: RepeatRule | null }[],
  timeZone: string
) {
  const lines = tasks.map((t, i) => {
    const repeat = t.repeatRule ? `, ${describeRepeat(t.repeatRule).toLowerCase()}` : ""
    return `${i + 1}. ${ROLES[t.agentKey].name}: ${t.title} (${formatWhen(t.scheduledAt, timeZone)}${repeat})`
  })
  return `${message}\n\n${lines.join("\n")}\n\nI'll post each result here as the team finishes it.`
}

// ---- Answering a question an agent raised mid-task ----

const answerSchema = z.object({
  canAnswer: z.boolean(),
  answer: z.string().default(""),
  questionForUser: z.string().default(""),
})

export async function answerAgentQuestion({
  campaignName,
  request,
  task,
  question,
  context,
  signal,
}: {
  campaignName: string
  request: AgentRequestRecord
  task: AgentTaskRecord
  question: string
  context: string
  signal?: AbortSignal
}) {
  const system = `${identity(campaignName)}
The ${ROLES[task.agentKey].name} asked you a question while working on the task "${task.title}".
Answer it yourself when the user's request, earlier answers, teammates' work or sound marketing judgment let you. ${task.agentKey === "analytics" ? "The Analytics Agent has tools that read the user's real analytics: questions about metrics get the answer to look them up with those tools, and to say plainly when a number isn't available." : "Questions about metrics or follower numbers"}${task.agentKey === "analytics" ? " Questions about" : ","} time zones, audiences or posting habits always get an answer from you: tell the agent to use a sensible, typical assumption${task.agentKey === "analytics" ? "" : " (no real data is available)"}. Set "canAnswer" to false only if the work is impossible without a fact only the user has (for example a product's name, price or launch date), and then write a short, friendly "questionForUser".
Reply with only a JSON object: {"canAnswer": true, "answer": "...", "questionForUser": ""}`
  const user = `User's request: ${request.prompt}\n\nTask instructions: ${task.instructions}${context ? `\n\n${context}` : ""}\n\nQuestion: ${question}`
  return completeJSON(answerSchema, [
    { role: "system", content: system },
    { role: "user", content: user },
  ], { signal })
}

// ---- Reviewing an agent's output ----

const reviewSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().default(""),
})

export async function reviewOutput({
  campaignName,
  task,
  output,
  evidence,
  userRequest = null,
  signal,
}: {
  campaignName: string
  task: AgentTaskRecord
  output: string
  // For agents with a computer: the pages it really opened and the files it made
  evidence?: string | null
  // What the user asked for, in their words
  userRequest?: string | null
  signal?: AbortSignal
}) {
  const analytics = task.agentKey === "analytics"
  const computerCheck = task.agentKey === "scheduler"
    ? evidence
      ? " The Scheduler Agent can schedule drafts to publish; what is really scheduled is listed below. If the work says a post is scheduled or posted but the list doesn't show it, reject it. If the task asked to post or schedule and nothing is scheduled, reject it unless the work clearly explains why it couldn't (for example no account connected)."
      : ""
    : analytics
    ? evidence
      ? " The Analytics Agent reads the user's real synced analytics; the data it had is included below. Numbers in the work that match this data (or plausibly come from its tools for other periods) are real, not invented. Reject the work if it states numbers that contradict this data, or calls a metric zero when the data says it isn't reported."
      : ""
    : evidence
    ? ` This agent has its own computer; its log is included below.${
        task.agentKey === "research"
          ? " If the research claims fresh or current information (today's trends, news, a competitor's latest posts) but the log shows no pages were opened, reject it and ask the agent to check the web, unless the user or the instructions said not to search."
          : " Never reject the Creator Agent's work for not browsing: it writes and makes images from its own knowledge and its teammates' work, and it may mention popular hashtags without checking them."
      }${
        task.agentKey === "creator"
          ? " The Creator Agent must save each post, caption or idea it delivers as a content draft: if the log shows no drafts were saved, reject it and ask it to save them with save_content_draft. If the instructions asked for images and the log shows none, ask for them. If they asked for a video and the log shows no .mp4 file, ask for it."
          : task.agentKey === "research"
            ? " The Research Agent must save its main findings to the database: if the log shows none were saved, reject it and ask it to save them with save_research_finding."
            : ""
      }`
    : ""
  const updated = task.instructions.includes(USER_UPDATE_PREFIX)
    ? ` The instructions include details the user added after the task was assigned ("${USER_UPDATE_PREFIX}"); they take priority over earlier instructions. If the work ignores them, reject it and tell the agent exactly what to change.`
    : ""
  const system = `${identity(campaignName)}
Review the work the ${ROLES[task.agentKey].name} delivered. Approve it if it completes the task instructions, stays in the agent's area and is usable. The user's request overrides everything: never ask for something the user said not to do (for example searching the web). Reject it only for clear problems: it is off-task, misses a major part of the instructions, describes work instead of doing it, or invents performance data. When rejecting, give short, specific feedback the agent can act on.${updated}${computerCheck}
Reply with only a JSON object: {"approved": true, "feedback": ""}`
  return completeJSON(reviewSchema, [
    { role: "system", content: system },
    {
      role: "user",
      content: `${userRequest ? `The user's request: ${userRequest}\n` : ""}Task: ${task.title}\nInstructions: ${task.instructions}\n\nDelivered work:\n${output}${evidence ? `\n\n${analytics ? "Analytics data" : task.agentKey === "scheduler" ? "Scheduled posts" : "Computer log"}:\n${evidence}` : ""}`,
    },
  ], { signal })
}

// ---- Final report to the user ----

export async function summarize({
  campaignName,
  request,
  tasks,
  signal,
}: {
  campaignName: string
  request: AgentRequestRecord
  tasks: AgentTaskRecord[]
  signal?: AbortSignal
}) {
  const work = tasks
    .map((t) => {
      const who = ROLES[t.agentKey].name
      if (t.output && (t.status === "completed" || t.repeatRule)) return `${who} - ${t.title} (done):\n${t.output}`
      return `${who} - ${t.title} (${t.status === "blocked" ? "skipped" : "failed"}): ${t.error ?? "no result"}`
    })
    .join("\n\n")
  const system = `${identity(campaignName)}
Your team has finished the user's request. Write your reply to the user: present the finished deliverables (keep the agents' actual content such as captions, ideas or calendars, condensed where needed, and say which agent made what). Copy every image and file URL from the results exactly as given, each on its own line, so the user can see them; mention that drafts and findings are saved, then mention any task that failed or was skipped and what the user can do about it. ${STYLE} Keep it under 400 words.`
  return completeText(
    [
      { role: "system", content: system },
      { role: "user", content: `Request: ${request.prompt}\n\nTeam results:\n${work}` },
    ],
    { temperature: 0.4, signal }
  )
}
