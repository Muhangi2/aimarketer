import "server-only"
import { MASTER_KEY, type AgentKey, type ThreadKey } from "@/lib/agent-roles"
import { QUESTION_PREFIX, ROLES, taskPrompt, taskSystemPrompt } from "@/lib/ai/agents"
import { completeText } from "@/lib/ai/llm"
import {
  answerAgentQuestion,
  decide,
  describePlan,
  normalizePlan,
  reviewOutput,
  summarize,
  type Decision,
} from "@/lib/ai/master"
import type { AgentStore, NewMessage, RequestPatch, TaskPatch } from "@/lib/agents/store"
import {
  ACTIVE_TASK_STATUSES,
  type AgentRequestRecord,
  type AgentStatus,
  type AgentTaskRecord,
  type MessageKind,
  type OrchestratorEvent,
  type TaskStatus,
} from "@/lib/agents/types"

// Questions the Master Agent answers for one task before asking the user
const MAX_AGENT_QUESTIONS = 2
// Times the Master Agent sends work back for changes
const MAX_REVISIONS = 1
// Guards against a task graph that never settles
const MAX_ROUNDS = 12
// A request still "running" after this long was left behind by a stopped server
const STALE_MS = 10 * 60 * 1000

const UNFINISHED: TaskStatus[] = ["failed", "blocked", "cancelled"]

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong."
}

function parseQuestion(output: string) {
  const line = output.trim().split("\n")[0]?.trim() ?? ""
  if (!line.toUpperCase().startsWith(QUESTION_PREFIX)) return null
  return line.slice(QUESTION_PREFIX.length).trim() || null
}

function appendNote(existing: string | null, note: string) {
  return existing ? `${existing}\n${note}` : note
}

/**
 * The Master Agent's control loop: turns a user message into a plan, runs each task on the right
 * agent in dependency order, answers agents' questions, reviews their work, asks the user when it
 * must, and reports back. Every step is saved, and progress is streamed through `emit`.
 */
export class Orchestrator {
  // Task id -> question waiting on the user, collected while a request runs
  private readonly userQuestions = new Map<string, string>()

  constructor(
    private readonly store: AgentStore,
    private readonly campaignName: string,
    private readonly emit: (event: OrchestratorEvent) => void
  ) {}

  // ---- Entry points ----

  /** Handles one message the user sent to the Master Agent. */
  async handleUserMessage(text: string) {
    const userMessage = await this.post({ thread: MASTER_KEY, sender: "user", recipient: MASTER_KEY, kind: "chat", content: text })
    await this.setAgent(MASTER_KEY, "working")
    let requestId: string | null = null
    try {
      await this.recoverStale()
      const [history, open, recent, states] = await Promise.all([
        this.store.listMessages(MASTER_KEY, 20),
        this.store.getOpenRequest(),
        this.store.listRequests(5),
        this.store.getStates(),
      ])
      const openTasks = open ? await this.store.listTasks(open.id) : []
      const decision = await decide({
        campaignName: this.campaignName,
        history: history.filter((m) => m.id !== userMessage.id),
        message: text,
        openRequest: open ? { ...open, hasTasks: openTasks.length > 0 } : null,
        recentRequests: recent,
        states,
      })

      switch (decision.action) {
        case "reply":
          await this.say(decision.message, "chat")
          break

        case "clarify": {
          // A follow-up to a request that has no plan yet refines that request
          let request: AgentRequestRecord
          if (open && openTasks.length === 0) {
            request = await this.patchRequest(open.id, {
              prompt: `${open.prompt}\n${text}`,
              status: "awaiting_clarification",
              clarificationQuestion: decision.message,
            })
          } else {
            if (open) await this.cancelRequest(open, openTasks)
            request = await this.createRequest(text, "awaiting_clarification", decision.message)
          }
          await this.say(decision.message, "clarification", request.id)
          break
        }

        case "resume": {
          if (!open) break
          requestId = open.id
          if (openTasks.length === 0) {
            await this.planOpenRequest(open, text)
          } else {
            await this.applyUserAnswer(open, openTasks, text)
            await this.say(decision.message, "update", open.id)
            await this.execute(open.id)
          }
          break
        }

        case "plan": {
          if (decision.tasks.length === 0) {
            await this.say(decision.message, "chat")
            break
          }
          let request: AgentRequestRecord
          if (open && openTasks.length === 0) {
            request = await this.patchRequest(open.id, {
              prompt: `${open.prompt}\n${text}`,
              status: "running",
              clarificationQuestion: null,
            })
          } else {
            if (open) await this.cancelRequest(open, openTasks)
            request = await this.createRequest(text, "running")
          }
          requestId = request.id
          await this.startPlan(request, decision)
          break
        }
      }
    } catch (error) {
      await this.fail(error, requestId)
    } finally {
      await this.setAgent(MASTER_KEY, "idle")
    }
  }

  /** Continues a request that was on hold because an agent was paused. */
  async resumeWaiting() {
    await this.setAgent(MASTER_KEY, "working")
    let requestId: string | null = null
    try {
      const open = await this.store.getOpenRequest()
      if (!open || open.status !== "waiting") return
      requestId = open.id
      await this.patchRequest(open.id, { status: "running" })
      await this.say("Your agents are back, so I'm picking the work back up.", "update", open.id)
      await this.execute(open.id)
    } catch (error) {
      await this.fail(error, requestId)
    } finally {
      await this.setAgent(MASTER_KEY, "idle")
    }
  }

  // ---- Planning ----

  private async startPlan(request: AgentRequestRecord, decision: Decision) {
    const plan = normalizePlan(decision.tasks)
    const tasks = await this.store.createTasks(request.id, plan)
    tasks.forEach((task) => this.emit({ type: "task", task }))
    await this.say(describePlan(decision.message, tasks), "plan", request.id)
    await this.execute(request.id)
  }

  // The user answered a question about a request that has no plan yet: plan it now
  private async planOpenRequest(open: AgentRequestRecord, answer: string) {
    const prompt = `${open.prompt}\n${answer}`
    const states = await this.store.getStates()
    const decision = await decide({
      campaignName: this.campaignName,
      history: [],
      message: `${prompt}\n\n(You asked: "${open.clarificationQuestion ?? ""}" and the user answered: "${answer}". Plan the work now.)`,
      openRequest: null,
      recentRequests: [],
      states,
    })
    if (decision.action === "plan" && decision.tasks.length > 0) {
      const request = await this.patchRequest(open.id, { prompt, status: "running", clarificationQuestion: null })
      await this.startPlan(request, decision)
    } else if (decision.action === "clarify") {
      await this.patchRequest(open.id, { prompt, clarificationQuestion: decision.message })
      await this.say(decision.message, "clarification", open.id)
    } else {
      await this.say(decision.message, "chat", open.id)
    }
  }

  // ---- Running tasks ----

  private async execute(requestId: string) {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const [tasks, states, request] = await Promise.all([
        this.store.listTasks(requestId),
        this.store.getStates(),
        this.store.getRequest(requestId),
      ])
      const byId = new Map(tasks.map((t) => [t.id, t]))

      // A task can't run once something it depends on has failed
      for (const task of tasks) {
        if (task.status !== "pending") continue
        const broken = task.dependsOn.map((id) => byId.get(id)).find((dep) => dep && UNFINISHED.includes(dep.status))
        if (broken) {
          const updated = await this.patchTask(task.id, {
            status: "blocked",
            error: `Skipped because "${broken.title}" did not finish.`,
          })
          byId.set(task.id, updated)
        }
      }

      // Ready tasks, at most one per agent at a time; independent agents work in parallel
      const claimed = new Set<AgentKey>()
      const ready = [...byId.values()].filter((task) => {
        if (task.status !== "pending" || states[task.agentKey] === "paused" || claimed.has(task.agentKey)) return false
        if (!task.dependsOn.every((id) => byId.get(id)?.status === "completed")) return false
        claimed.add(task.agentKey)
        return true
      })
      if (ready.length === 0) break

      await Promise.all(ready.map((task) => this.runTask(task, byId, request)))
    }
    await this.finish(requestId)
  }

  private async runTask(task: AgentTaskRecord, byId: Map<string, AgentTaskRecord>, request: AgentRequestRecord) {
    const agentKey = task.agentKey
    const agentName = ROLES[agentKey].name
    const firstRun = task.attempts === 0

    try {
      await this.patchTask(task.id, {
        status: "in_progress",
        attempts: task.attempts + 1,
        startedAt: task.startedAt ?? Date.now(),
        error: null,
      })
      await this.setAgent(agentKey, "working", task.id)
      if (firstRun) {
        await this.post({
          thread: agentKey,
          sender: MASTER_KEY,
          recipient: agentKey,
          kind: "assignment",
          content: `New task: ${task.title}\n\n${task.instructions}`,
          requestId: request.id,
          taskId: task.id,
        })
      }

      const inputs = task.dependsOn
        .map((id) => byId.get(id))
        .filter((dep): dep is AgentTaskRecord => !!dep?.output && dep.status === "completed")
        .map((dep) => ({ agentName: ROLES[dep.agentKey].name, title: dep.title, output: dep.output! }))

      let clarifications = task.clarifications
      let feedback: string | null = null
      let questions = 0
      let revisions = 0
      const toMaster = (kind: MessageKind, content: string) =>
        this.post({ thread: agentKey, sender: agentKey, recipient: MASTER_KEY, kind, content, requestId: request.id, taskId: task.id })
      const toAgent = (kind: MessageKind, content: string) =>
        this.post({ thread: agentKey, sender: MASTER_KEY, recipient: agentKey, kind, content, requestId: request.id, taskId: task.id })

      for (;;) {
        const output = await completeText(
          [
            { role: "system", content: taskSystemPrompt(agentKey, this.campaignName) },
            { role: "user", content: taskPrompt({ title: task.title, instructions: task.instructions, inputs, clarifications, feedback }) },
          ],
          { temperature: 0.6 }
        )
        if (!output) throw new Error(`The ${agentName} returned an empty answer.`)

        // The agent needs information: the Master Agent answers it, or asks the user
        const question = parseQuestion(output)
        if (question) {
          await toMaster("question", question)
          const verdict =
            questions < MAX_AGENT_QUESTIONS
              ? await answerAgentQuestion({
                  campaignName: this.campaignName,
                  request,
                  task,
                  question,
                  context: inputs.map((i) => `Work from the ${i.agentName}:\n${i.output}`).join("\n\n"),
                }).catch(() => null)
              : null
          if (verdict?.canAnswer && verdict.answer.trim()) {
            questions++
            await toAgent("answer", verdict.answer.trim())
            clarifications = appendNote(clarifications, `Q: ${question}\nA (from the Master Agent): ${verdict.answer.trim()}`)
            await this.patchTask(task.id, { clarifications })
            continue
          }
          const forUser = verdict?.questionForUser.trim() || question
          this.userQuestions.set(task.id, `${agentName}: ${forUser}`)
          await this.patchTask(task.id, { status: "needs_input", clarifications: appendNote(clarifications, `Q: ${forUser}`) })
          await this.setAgent(agentKey, "idle")
          return
        }

        await toMaster("result", output)
        await this.patchTask(task.id, { status: "in_review", output })

        // A failed review call shouldn't throw away finished work
        const review = await reviewOutput({ campaignName: this.campaignName, task, output }).catch(() => ({
          approved: true,
          feedback: "",
        }))
        if (!review.approved && review.feedback.trim() && revisions < MAX_REVISIONS) {
          revisions++
          feedback = review.feedback.trim()
          await toAgent("review", `Please revise: ${feedback}`)
          await this.patchTask(task.id, { status: "in_progress", reviewFeedback: feedback })
          continue
        }

        await toAgent("review", review.approved ? "Approved. Thanks!" : `Accepted. Note for next time: ${review.feedback}`)
        await this.patchTask(task.id, {
          status: "completed",
          completedAt: Date.now(),
          reviewFeedback: review.approved ? null : review.feedback || null,
        })
        await this.setAgent(agentKey, "idle")
        return
      }
    } catch (error) {
      const message = errorMessage(error)
      console.error(`Task "${task.title}" (${agentKey}) failed`, error)
      await this.safely(() =>
        this.post({
          thread: agentKey,
          sender: agentKey,
          recipient: MASTER_KEY,
          kind: "error",
          content: `I couldn't finish "${task.title}": ${message}`,
          requestId: request.id,
          taskId: task.id,
        })
      )
      await this.safely(() => this.patchTask(task.id, { status: "failed", error: message }))
      await this.safely(() => this.setAgent(agentKey, "error"))
    }
  }

  // Decides what the request's outcome is once no more tasks can run
  private async finish(requestId: string) {
    const [request, tasks] = await Promise.all([this.store.getRequest(requestId), this.store.listTasks(requestId)])

    const needsInput = tasks.filter((t) => t.status === "needs_input")
    if (needsInput.length > 0) {
      const questions = needsInput.map(
        (t) => this.userQuestions.get(t.id) ?? `${ROLES[t.agentKey].name}: ${t.clarifications?.split("\n").pop()?.replace(/^Q:\s*/, "") ?? ""}`
      )
      const text =
        questions.length === 1
          ? `I need one detail from you before the team can continue.\n\n${questions[0]}`
          : `I need a few details from you before the team can continue.\n\n${questions.map((q) => `- ${q}`).join("\n")}`
      await this.patchRequest(requestId, { status: "awaiting_clarification", clarificationQuestion: questions.join("\n") })
      await this.say(text, "clarification", requestId)
      return
    }

    const onHold = tasks.filter((t) => t.status === "pending")
    if (onHold.length > 0) {
      const names = [...new Set(onHold.map((t) => ROLES[t.agentKey].name))]
      const who = names.length === 1 ? `The ${names[0]} is` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)} are`
      await this.patchRequest(requestId, { status: "waiting" })
      await this.say(
        `${who} paused, so I've put ${onHold.length === 1 ? "1 task" : `${onHold.length} tasks`} on hold. Resume ${names.length === 1 ? "it" : "them"} and I'll pick the work back up.`,
        "update",
        requestId
      )
      return
    }

    const done = tasks.filter((t) => t.status === "completed")
    const unfinished = tasks.filter((t) => UNFINISHED.includes(t.status))
    if (done.length === 0) {
      const reasons = unfinished.map((t) => `- ${ROLES[t.agentKey].name}: ${t.error ?? "no result"}`).join("\n")
      await this.patchRequest(requestId, { status: "failed", error: "No task finished." })
      await this.say(`The team couldn't complete this request.\n\n${reasons}\n\nYou can ask me to try again.`, "error", requestId)
      return
    }

    const summary = await summarize({ campaignName: this.campaignName, request, tasks }).catch((error) => {
      console.error("Master Agent summary failed", error)
      // Fall back to the raw deliverables so the work isn't lost
      return done.map((t) => `${ROLES[t.agentKey].name} - ${t.title}:\n${t.output ?? ""}`).join("\n\n")
    })
    await this.patchRequest(requestId, {
      status: "completed",
      summary: summary || "Done.",
      error: unfinished.length > 0 ? `${unfinished.length} task(s) did not finish.` : null,
    })
    await this.say(summary || "All done.", "summary", requestId)
  }

  // ---- State changes ----

  private async applyUserAnswer(request: AgentRequestRecord, tasks: AgentTaskRecord[], answer: string) {
    await this.patchRequest(request.id, { status: "running", clarificationQuestion: null })
    for (const task of tasks.filter((t) => t.status === "needs_input")) {
      await this.patchTask(task.id, {
        status: "pending",
        clarifications: appendNote(task.clarifications, `A (from the user): ${answer}`),
      })
      await this.post({
        thread: task.agentKey,
        sender: MASTER_KEY,
        recipient: task.agentKey,
        kind: "answer",
        content: `The user answered: ${answer}`,
        requestId: request.id,
        taskId: task.id,
      })
    }
  }

  private async cancelRequest(request: AgentRequestRecord, tasks: AgentTaskRecord[]) {
    for (const task of tasks.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status))) {
      await this.patchTask(task.id, { status: "cancelled", error: "Replaced by a newer request." })
    }
    await this.patchRequest(request.id, { status: "cancelled", clarificationQuestion: null })
  }

  // Requests a stopped server left mid-way can't be trusted to resume cleanly
  private async recoverStale() {
    const stale = await this.store.listStaleRequests(STALE_MS)
    for (const request of stale) {
      const tasks = await this.store.listTasks(request.id)
      for (const task of tasks.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status))) {
        await this.patchTask(task.id, { status: "failed", error: "Interrupted before it finished." })
      }
      await this.patchRequest(request.id, { status: "failed", error: "Interrupted before it finished." })
    }
  }

  private async fail(error: unknown, requestId: string | null) {
    console.error("Master Agent failed", error)
    const message = errorMessage(error)
    if (requestId) {
      await this.safely(async () => {
        const tasks = await this.store.listTasks(requestId)
        for (const task of tasks.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status))) {
          await this.patchTask(task.id, { status: "failed", error: message })
        }
        await this.patchRequest(requestId, { status: "failed", error: message })
      })
    }
    await this.safely(() => this.say(`Something went wrong: ${message}`, "error", requestId))
    this.emit({ type: "error", message })
  }

  // ---- Persistence + streaming ----

  private async post(message: NewMessage) {
    const saved = await this.store.addMessage(message)
    this.emit({ type: "message", message: saved })
    return saved
  }

  private say(content: string, kind: MessageKind, requestId: string | null = null) {
    return this.post({ thread: MASTER_KEY, sender: MASTER_KEY, recipient: "user", kind, content, requestId })
  }

  private async createRequest(prompt: string, status: AgentRequestRecord["status"], question: string | null = null) {
    const request = await this.store.createRequest(prompt, status, question)
    this.emit({ type: "request", request })
    return request
  }

  private async patchRequest(id: string, patch: RequestPatch) {
    const request = await this.store.updateRequest(id, patch)
    this.emit({ type: "request", request })
    return request
  }

  private async patchTask(id: string, patch: TaskPatch) {
    const task = await this.store.updateTask(id, patch)
    this.emit({ type: "task", task })
    return task
  }

  // Status is cosmetic: a failed write shouldn't stop the work
  private async setAgent(agentKey: ThreadKey, status: AgentStatus, taskId: string | null = null) {
    await this.safely(async () => {
      const stored = await this.store.setState(agentKey, status, taskId)
      this.emit({ type: "agent", agentKey, status: stored })
    })
  }

  private async safely(fn: () => Promise<unknown>) {
    try {
      await fn()
    } catch (error) {
      console.error("Master Agent bookkeeping failed", error)
    }
  }
}
