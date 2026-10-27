import "server-only"
import { z } from "zod"
import { AGENT_KEYS, type AgentKey } from "@/lib/agent-roles"
import { ROLES } from "@/lib/ai/agents"
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

export const decisionSchema = z.object({
  action: z.enum(["reply", "clarify", "plan", "resume"]),
  message: z.string().trim().min(1).max(3000),
  tasks: z.array(plannedTask).max(MAX_TASKS_PER_PLAN).default([]),
})

export type Decision = z.infer<typeof decisionSchema>
export type PlannedTask = z.infer<typeof plannedTask>

export async function decide({
  campaignName,
  history,
  message,
  openRequest,
  recentRequests,
  states,
  timeZone,
  upcoming,
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

  const system = `${identity(campaignName)}

Your agents (use these exact keys):
${teamList(states)}

Decide how to handle the user's latest message. Reply with only a JSON object:
{"action": "reply" | "clarify" | "plan" | "resume", "message": "...", "tasks": [{"id": "t1", "agent": "research", "title": "...", "instructions": "...", "dependsOn": [], "runAt": "now", "repeat": null}]}

- "reply": greetings, small talk, or questions about the team, its status or past work. "message" is your answer. "tasks" is [].
- "clarify": the user wants work done but it is too vague to plan and you cannot reasonably assume the missing detail. "message" is one short, specific question. "tasks" is [].
- "plan": the user wants work done. "message" briefly tells the user your plan. "tasks" has 1 to ${MAX_TASKS_PER_PLAN} tasks in the order they should run, each for exactly one agent and only within that agent's area. Use only the agents the request needs. "dependsOn" lists the ids of earlier tasks whose output the task needs (for example the Creator writing posts about the Research Agent's ideas). Each task's "instructions" must be specific and self-contained, including the platform, goal and any details the user gave.
  Scheduling: you decide when each task runs. "runAt" is "now" or {"daysFromToday": 0-90, "time": "HH:MM"} in the user's local time (24h). Use "now" for work the user wants right away; otherwise spread tasks out sensibly: research first, content after the research it uses, posting-related work at good times for the platform (for example weekday mornings or evenings), and no more than ${MAX_TASKS_PER_AGENT_PER_DAY} tasks per agent per day. Avoid times already taken in the schedule below.
  "repeat" is null, or for recurring work (only when the user asks for it, e.g. "every Monday", "daily"): {"every": 1, "unit": "hour" | "day" | "week" | "month", "count": optional number of runs}. The first run happens at "runAt".
- "resume": only when you were waiting on the user (see below) and they answered or asked you to continue. "message" acknowledges it. "tasks" is [].
Only plan social media marketing work. If the request is unrelated, use "reply" and say you only help with this campaign's social media.${pending}${past ? `\n\nRecent work by the team:\n${past}` : ""}

Current time for the user: ${new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "full", timeStyle: "short" }).format(Date.now())} (${timeZone}).
Already scheduled:
${schedule || "- nothing"}`

  const conversation = history
    .filter((m) => !m.error && (m.sender === "user" || m.sender === "master"))
    .slice(-10)
    .map((m) => ({ role: m.sender === "user" ? ("user" as const) : ("assistant" as const), content: m.content }))

  const decision = await completeJSON(
    decisionSchema,
    [{ role: "system", content: system }, ...conversation, { role: "user", content: message }],
    { signal }
  )
  if (decision.action === "resume" && !openRequest) return { ...decision, action: "reply" }
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
      instructions: task.instructions,
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
Answer it yourself when the user's request, earlier answers, teammates' work or sound marketing judgment let you. Questions about metrics or follower numbers, time zones, audiences or posting habits always get an answer from you: tell the agent to use a sensible, typical assumption (no real data is available). Set "canAnswer" to false only if the work is impossible without a fact only the user has (for example a product's name, price or launch date), and then write a short, friendly "questionForUser".
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
  signal,
}: {
  campaignName: string
  task: AgentTaskRecord
  output: string
  signal?: AbortSignal
}) {
  const system = `${identity(campaignName)}
Review the work the ${ROLES[task.agentKey].name} delivered. Approve it if it completes the task instructions, stays in the agent's area and is usable. Reject it only for clear problems: it is off-task, misses a major part of the instructions, describes work instead of doing it, or invents performance data. When rejecting, give short, specific feedback the agent can act on.
Reply with only a JSON object: {"approved": true, "feedback": ""}`
  return completeJSON(reviewSchema, [
    { role: "system", content: system },
    { role: "user", content: `Task: ${task.title}\nInstructions: ${task.instructions}\n\nDelivered work:\n${output}` },
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
Your team has finished the user's request. Write your reply to the user: present the finished deliverables (keep the agents' actual content such as captions, ideas or calendars, condensed where needed, and say which agent made what), then mention any task that failed or was skipped and what the user can do about it. ${STYLE} Keep it under 400 words.`
  return completeText(
    [
      { role: "system", content: system },
      { role: "user", content: `Request: ${request.prompt}\n\nTeam results:\n${work}` },
    ],
    { temperature: 0.4, signal }
  )
}
