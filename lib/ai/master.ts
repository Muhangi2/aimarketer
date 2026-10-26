import "server-only"
import { z } from "zod"
import { AGENT_KEYS, type AgentKey } from "@/lib/agent-roles"
import { ROLES } from "@/lib/ai/agents"
import { completeJSON, completeText } from "@/lib/ai/llm"
import type { AgentMessage, AgentRequestRecord, AgentStates, AgentTaskRecord } from "@/lib/agents/types"

export const MAX_TASKS_PER_PLAN = 6

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

const plannedTask = z.object({
  id: z.string().min(1).max(20),
  agent: z.enum(AGENT_KEYS),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(3000),
  dependsOn: z.array(z.string()).default([]),
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
  signal,
}: {
  campaignName: string
  history: AgentMessage[]
  message: string
  openRequest: (AgentRequestRecord & { hasTasks: boolean }) | null
  recentRequests: AgentRequestRecord[]
  states: AgentStates
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

  const system = `${identity(campaignName)}

Your agents (use these exact keys):
${teamList(states)}

Decide how to handle the user's latest message. Reply with only a JSON object:
{"action": "reply" | "clarify" | "plan" | "resume", "message": "...", "tasks": [{"id": "t1", "agent": "research", "title": "...", "instructions": "...", "dependsOn": []}]}

- "reply": greetings, small talk, or questions about the team, its status or past work. "message" is your answer. "tasks" is [].
- "clarify": the user wants work done but it is too vague to plan and you cannot reasonably assume the missing detail. "message" is one short, specific question. "tasks" is [].
- "plan": the user wants work done. "message" briefly tells the user your plan. "tasks" has 1 to ${MAX_TASKS_PER_PLAN} tasks in the order they should run, each for exactly one agent and only within that agent's area. Use only the agents the request needs. "dependsOn" lists the ids of earlier tasks whose output the task needs (for example the Creator writing posts about the Research Agent's ideas). Each task's "instructions" must be specific and self-contained, including the platform, goal and any details the user gave.
- "resume": only when you were waiting on the user (see below) and they answered or asked you to continue. "message" acknowledges it. "tasks" is [].
Only plan social media marketing work. If the request is unrelated, use "reply" and say you only help with this campaign's social media.${pending}${past ? `\n\nRecent work by the team:\n${past}` : ""}`

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
 * Checks a plan's task graph: unknown ids are dropped from dependencies, and any dependency on
 * the same or a later task is removed, which also rules out cycles. Returns tasks with index deps.
 */
export function normalizePlan(tasks: PlannedTask[]) {
  const unique = tasks.slice(0, MAX_TASKS_PER_PLAN)
  const indexById = new Map<string, number>()
  unique.forEach((t, i) => {
    if (!indexById.has(t.id)) indexById.set(t.id, i)
  })
  return unique.map((task, i) => ({
    agentKey: task.agent as AgentKey,
    title: task.title,
    instructions: task.instructions,
    position: i,
    dependsOn: [...new Set(task.dependsOn.map((id) => indexById.get(id)).filter((d): d is number => d !== undefined && d < i))],
  }))
}

export function describePlan(message: string, tasks: { agentKey: AgentKey; title: string }[]) {
  const lines = tasks.map((t, i) => `${i + 1}. ${ROLES[t.agentKey].name}: ${t.title}`)
  return `${message}\n\n${lines.join("\n")}`
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
Answer it yourself when the user's request, earlier answers, teammates' work or sound marketing judgment let you. Set "canAnswer" to false only if it needs a fact only the user can provide (for example product details, prices, dates or brand rules), and then write a short, friendly "questionForUser".
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
      if (t.status === "completed") return `${who} - ${t.title} (done):\n${t.output ?? ""}`
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
