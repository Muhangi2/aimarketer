import "server-only"
import { MASTER_KEY, type ThreadKey } from "@/lib/agent-roles"
import { USER_UPDATE_PREFIX, activeTaskRefs, decide, describePlan, normalizePlan, type Decision } from "@/lib/ai/master"
import { dispatchDueTasks } from "@/lib/agents/dispatch"
import type { AgentStore, NewMessage, RequestPatch, TaskPatch } from "@/lib/agents/store"
import {
  ACTIVE_TASK_STATUSES,
  type AgentRequestRecord,
  type AgentStatus,
  type AgentTaskRecord,
  type MessageKind,
  type OrchestratorEvent,
} from "@/lib/agents/types"

// How far ahead the Master Agent looks at the existing schedule when planning
const SCHEDULE_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong."
}

function appendNote(existing: string | null, note: string) {
  return existing ? `${existing}\n${note}` : note
}

/**
 * The Master Agent's chat turn: turns a user message into a reply, a question, or a scheduled plan.
 * Planned tasks are saved as pending with a time; tasks due within 15 minutes are dispatched to
 * Inngest right away and the rest are picked up by the cron (lib/inngest/functions.ts), which
 * runs them, reviews the work and reports back in this chat.
 */
export class Orchestrator {
  constructor(
    private readonly store: AgentStore,
    private readonly campaignName: string,
    private readonly timeZone: string,
    private readonly emit: (event: OrchestratorEvent) => void
  ) {}

  async handleUserMessage(text: string) {
    const userMessage = await this.post({ thread: MASTER_KEY, sender: "user", recipient: MASTER_KEY, kind: "chat", content: text })
    await this.setAgent(MASTER_KEY, "working")
    let requestId: string | null = null
    try {
      const [history, open, recent, states, upcoming] = await Promise.all([
        this.store.listMessages(MASTER_KEY, 20),
        this.store.getOpenRequest(),
        this.store.listRequests(5),
        this.store.getStates(),
        this.store.listUpcomingTasks(Date.now() + SCHEDULE_LOOKAHEAD_MS),
      ])
      const openTasks = open ? await this.store.listTasks(open.id) : []
      const activeTasks = await this.store.listActiveTasks()
      const decision = await decide({
        campaignName: this.campaignName,
        history: history.filter((m) => m.id !== userMessage.id),
        message: text,
        openRequest: open ? { ...open, hasTasks: openTasks.length > 0 } : null,
        recentRequests: recent,
        states,
        timeZone: this.timeZone,
        upcoming,
        activeTasks,
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

        case "update": {
          const refs = activeTaskRefs(activeTasks)
          const updated = await this.applyUpdates(
            decision.updates.map((u) => ({ task: refs.get(u.task)!, addition: u.addition }))
          )
          requestId = updated[0]?.requestId ?? null
          await this.say(decision.message, "update", requestId)
          break
        }

        case "resume": {
          if (!open) break
          requestId = open.id
          if (openTasks.length === 0) {
            await this.planOpenRequest(open, text, upcoming)
          } else {
            await this.applyUserAnswer(open, openTasks, text)
            await this.say(decision.message, "update", open.id)
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
            request = await this.patchRequest(open.id, { prompt: `${open.prompt}\n${text}`, status: "running", clarificationQuestion: null })
          } else {
            if (open) await this.cancelRequest(open, openTasks)
            request = await this.createRequest(text, "running")
          }
          requestId = request.id
          await this.schedulePlan(request, decision, upcoming)
          break
        }
      }
    } catch (error) {
      await this.fail(error, requestId)
    } finally {
      await this.setAgent(MASTER_KEY, "idle")
    }
  }

  // ---- Planning ----

  private async schedulePlan(request: AgentRequestRecord, decision: Decision, upcoming: AgentTaskRecord[]) {
    const plan = normalizePlan(decision.tasks, { timeZone: this.timeZone, upcoming })
    const tasks = await this.store.createTasks(request.id, plan)
    tasks.forEach((task) => this.emit({ type: "task", task }))
    await this.say(describePlan(decision.message, tasks, this.timeZone), "plan", request.id)
    await this.dispatch(tasks)
  }

  // The user answered a question about a request that has no plan yet: plan it now
  private async planOpenRequest(open: AgentRequestRecord, answer: string, upcoming: AgentTaskRecord[]) {
    const prompt = `${open.prompt}\n${answer}`
    const decision = await decide({
      campaignName: this.campaignName,
      history: [],
      message: `${prompt}\n\n(You asked: "${open.clarificationQuestion ?? ""}" and the user answered: "${answer}". Plan the work now.)`,
      openRequest: null,
      recentRequests: [],
      states: await this.store.getStates(),
      timeZone: this.timeZone,
      upcoming,
    })
    if (decision.action === "plan" && decision.tasks.length > 0) {
      const request = await this.patchRequest(open.id, { prompt, status: "running", clarificationQuestion: null })
      await this.schedulePlan(request, decision, upcoming)
    } else if (decision.action === "clarify") {
      await this.patchRequest(open.id, { prompt, clarificationQuestion: decision.message })
      await this.say(decision.message, "clarification", open.id)
    } else {
      await this.say(decision.message, "chat", open.id)
    }
  }

  // ---- State changes ----

  /**
   * The user added details for work already assigned: they go into the existing tasks' instructions
   * instead of new tasks. Tasks that haven't started pick them up when they run; a task that is
   * already running gets them in its review (see reviewOutput) and its next attempt.
   */
  private async applyUpdates(updates: { task: AgentTaskRecord; addition: string }[]) {
    const byTask = new Map<string, { task: AgentTaskRecord; additions: string[] }>()
    for (const { task, addition } of updates) {
      const entry = byTask.get(task.id) ?? { task, additions: [] }
      entry.additions.push(addition)
      byTask.set(task.id, entry)
    }
    const updated: AgentTaskRecord[] = []
    for (const { task, additions } of byTask.values()) {
      const note = `${USER_UPDATE_PREFIX} ${additions.join(" ")}`
      updated.push(await this.patchTask(task.id, { instructions: `${task.instructions}\n\n${note}` }))
      await this.post({
        thread: task.agentKey,
        sender: MASTER_KEY,
        recipient: task.agentKey,
        kind: "update",
        content: `New details for "${task.title}". ${note}`,
        requestId: task.requestId,
        taskId: task.id,
      })
    }
    return updated
  }

  // The user answered the agents' questions: those tasks run again now, with the answer
  private async applyUserAnswer(request: AgentRequestRecord, tasks: AgentTaskRecord[], answer: string) {
    await this.patchRequest(request.id, { status: "running", clarificationQuestion: null })
    const resumed: AgentTaskRecord[] = []
    for (const task of tasks.filter((t) => t.status === "needs_input")) {
      resumed.push(
        await this.patchTask(task.id, {
          status: "pending",
          scheduledAt: Date.now(),
          queuedAt: null,
          clarifications: appendNote(task.clarifications, `A (from the user): ${answer}`),
        })
      )
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
    await this.dispatch(resumed)
  }

  private async cancelRequest(request: AgentRequestRecord, tasks: AgentTaskRecord[]) {
    // Running tasks finish their current attempt; anything not yet started is cancelled
    for (const task of tasks.filter((t) => t.status === "pending" || t.status === "needs_input")) {
      await this.patchTask(task.id, { status: "cancelled", error: "Replaced by a newer request." })
    }
    await this.patchRequest(request.id, { status: "cancelled", clarificationQuestion: null })
  }

  // Sends tasks due within 15 minutes to Inngest now; later ones wait for the cron
  private async dispatch(tasks: AgentTaskRecord[]) {
    const sent = await dispatchDueTasks(this.store, tasks)
    sent.forEach((task) => this.emit({ type: "task", task }))
  }

  private async fail(error: unknown, requestId: string | null) {
    console.error("Master Agent failed", error)
    const message = errorMessage(error)
    if (requestId) {
      await this.safely(async () => {
        const tasks = await this.store.listTasks(requestId)
        for (const task of tasks.filter((t) => t.status === "pending")) {
          await this.patchTask(task.id, { status: "failed", error: message })
        }
        if (!tasks.some((t) => ACTIVE_TASK_STATUSES.includes(t.status) && t.status !== "pending")) {
          await this.patchRequest(requestId, { status: "failed", error: message })
        }
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
  private async setAgent(agentKey: ThreadKey, status: AgentStatus) {
    await this.safely(async () => {
      const stored = await this.store.setState(agentKey, status)
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
