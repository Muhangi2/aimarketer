import "server-only"
import type { createServerClient } from "@insforge/sdk/ssr"
import { iso, nextOccurrence } from "@/lib/agents/schedule"
import { THREAD_KEYS, type AgentKey, type ThreadKey } from "@/lib/agent-roles"
import {
  OPEN_REQUEST_STATUSES,
  type AgentMessage,
  type AgentRequestRecord,
  type AgentStates,
  type AgentStatus,
  type AgentTaskRecord,
  type MessageKind,
  type Participant,
  type RepeatRule,
  type RequestStatus,
  type TaskRunRecord,
  type TaskStatus,
  type WorkspaceSnapshot,
} from "@/lib/agents/types"

// The signed-in user's client (RLS) or the admin client used by background jobs
type DatabaseClient = { database: ReturnType<typeof createServerClient>["database"] }

export class StoreError extends Error {
  constructor(action: string, cause: unknown) {
    const detail = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : String(cause)
    super(`Could not ${action}: ${detail}`)
    this.name = "StoreError"
  }
}

const MESSAGE_COLUMNS = "id, thread, sender, recipient, kind, content, request_id, task_id, created_at"
const REQUEST_COLUMNS = "id, prompt, status, clarification_question, summary, error, created_at, updated_at"
const TASK_COLUMNS =
  "id, request_id, agent_key, title, instructions, status, depends_on, position, clarifications, output, review_feedback, attempts, error, started_at, completed_at, created_at, updated_at, scheduled_at, repeat_rule, next_run_at, run_count, queued_at, last_run_at"
const RUN_COLUMNS = "id, task_id, scheduled_for, status, output, error, started_at, finished_at"

type Row = Record<string, unknown>

const time = (v: unknown) => (v ? new Date(String(v)).getTime() : 0)
const timeOrNull = (v: unknown) => (v ? new Date(String(v)).getTime() : null)
const str = (v: unknown) => (v == null ? null : String(v))

function toMessage(r: Row): AgentMessage {
  return {
    id: String(r.id),
    thread: r.thread as ThreadKey,
    sender: r.sender as Participant,
    recipient: r.recipient as Participant,
    kind: r.kind as MessageKind,
    content: String(r.content),
    requestId: str(r.request_id),
    taskId: str(r.task_id),
    at: time(r.created_at),
  }
}

function toRequest(r: Row): AgentRequestRecord {
  return {
    id: String(r.id),
    prompt: String(r.prompt),
    status: r.status as RequestStatus,
    clarificationQuestion: str(r.clarification_question),
    summary: str(r.summary),
    error: str(r.error),
    createdAt: time(r.created_at),
    updatedAt: time(r.updated_at),
  }
}

function toTask(r: Row): AgentTaskRecord {
  return {
    id: String(r.id),
    requestId: String(r.request_id),
    agentKey: r.agent_key as AgentKey,
    title: String(r.title),
    instructions: String(r.instructions),
    status: r.status as TaskStatus,
    dependsOn: Array.isArray(r.depends_on) ? r.depends_on.map(String) : [],
    position: Number(r.position ?? 0),
    clarifications: str(r.clarifications),
    output: str(r.output),
    reviewFeedback: str(r.review_feedback),
    attempts: Number(r.attempts ?? 0),
    error: str(r.error),
    startedAt: timeOrNull(r.started_at),
    completedAt: timeOrNull(r.completed_at),
    createdAt: time(r.created_at),
    updatedAt: time(r.updated_at),
    scheduledAt: time(r.scheduled_at),
    repeatRule: (r.repeat_rule as RepeatRule | null) ?? null,
    nextRunAt: timeOrNull(r.next_run_at),
    runCount: Number(r.run_count ?? 0),
    queuedAt: timeOrNull(r.queued_at),
    lastRunAt: timeOrNull(r.last_run_at),
  }
}

function toRun(r: Row): TaskRunRecord {
  return {
    id: String(r.id),
    taskId: String(r.task_id),
    scheduledFor: time(r.scheduled_for),
    status: r.status as TaskRunRecord["status"],
    output: str(r.output),
    error: str(r.error),
    startedAt: time(r.started_at),
    finishedAt: timeOrNull(r.finished_at),
  }
}

export type NewMessage = {
  thread: ThreadKey
  sender: Participant
  recipient: Participant
  kind: MessageKind
  content: string
  requestId?: string | null
  taskId?: string | null
}

export type NewTask = {
  agentKey: AgentKey
  title: string
  instructions: string
  // Indexes of earlier tasks in the same list
  dependsOn: number[]
  position: number
  scheduledAt: number
  repeatRule: RepeatRule | null
}

export type TaskPatch = Partial<{
  status: TaskStatus
  output: string | null
  reviewFeedback: string | null
  clarifications: string | null
  attempts: number
  error: string | null
  startedAt: number | null
  completedAt: number | null
  scheduledAt: number
  nextRunAt: number | null
  runCount: number
  queuedAt: number | null
  lastRunAt: number | null
}>

export type RequestPatch = Partial<{
  prompt: string
  status: RequestStatus
  clarificationQuestion: string | null
  summary: string | null
  error: string | null
}>

const isoOrNull = (ms: number | null | undefined) => (ms == null ? null : iso(ms))

function taskRow(patch: TaskPatch) {
  const row: Row = {}
  if (patch.status !== undefined) row.status = patch.status
  if (patch.output !== undefined) row.output = patch.output
  if (patch.reviewFeedback !== undefined) row.review_feedback = patch.reviewFeedback
  if (patch.clarifications !== undefined) row.clarifications = patch.clarifications
  if (patch.attempts !== undefined) row.attempts = patch.attempts
  if (patch.error !== undefined) row.error = patch.error
  if (patch.startedAt !== undefined) row.started_at = isoOrNull(patch.startedAt)
  if (patch.completedAt !== undefined) row.completed_at = isoOrNull(patch.completedAt)
  if (patch.scheduledAt !== undefined) row.scheduled_at = iso(patch.scheduledAt)
  if (patch.nextRunAt !== undefined) row.next_run_at = isoOrNull(patch.nextRunAt)
  if (patch.runCount !== undefined) row.run_count = patch.runCount
  if (patch.queuedAt !== undefined) row.queued_at = isoOrNull(patch.queuedAt)
  if (patch.lastRunAt !== undefined) row.last_run_at = isoOrNull(patch.lastRunAt)
  return row
}

/**
 * Reads and writes one campaign's agent conversations, requests, tasks, runs and statuses.
 * With the signed-in user's client RLS scopes every row to its owner; with the admin client
 * (background jobs) the explicit campaign and user filters do.
 */
export class AgentStore {
  private readonly db: DatabaseClient["database"]

  constructor(
    insforge: DatabaseClient,
    readonly campaignId: string,
    readonly userId: string
  ) {
    this.db = insforge.database
  }

  // ---- Messages ----

  async listMessages(thread: ThreadKey, limit = 60): Promise<AgentMessage[]> {
    const { data, error } = await this.db
      .from("agent_message")
      .select(MESSAGE_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .eq("thread", thread)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) throw new StoreError("load messages", error)
    return ((data ?? []) as Row[]).map(toMessage).reverse()
  }

  async addMessage(message: NewMessage): Promise<AgentMessage> {
    const { data, error } = await this.db
      .from("agent_message")
      .insert([
        {
          campaign_id: this.campaignId,
          user_id: this.userId,
          thread: message.thread,
          sender: message.sender,
          recipient: message.recipient,
          kind: message.kind,
          content: message.content,
          request_id: message.requestId ?? null,
          task_id: message.taskId ?? null,
        },
      ])
      .select(MESSAGE_COLUMNS)
      .single()
    if (error || !data) throw new StoreError("save message", error)
    return toMessage(data as Row)
  }

  async clearThread(thread: ThreadKey) {
    const { error } = await this.db.from("agent_message").delete().eq("campaign_id", this.campaignId).eq("thread", thread)
    if (error) throw new StoreError("clear chat", error)
  }

  // ---- Requests ----

  async createRequest(prompt: string, status: RequestStatus, clarificationQuestion: string | null = null) {
    const { data, error } = await this.db
      .from("agent_request")
      .insert([
        {
          campaign_id: this.campaignId,
          user_id: this.userId,
          prompt: prompt.slice(0, 4000),
          status,
          clarification_question: clarificationQuestion,
        },
      ])
      .select(REQUEST_COLUMNS)
      .single()
    if (error || !data) throw new StoreError("create request", error)
    return toRequest(data as Row)
  }

  async updateRequest(id: string, patch: RequestPatch) {
    const row: Row = {}
    if (patch.prompt !== undefined) row.prompt = patch.prompt.slice(0, 4000)
    if (patch.status !== undefined) row.status = patch.status
    if (patch.clarificationQuestion !== undefined) row.clarification_question = patch.clarificationQuestion
    if (patch.summary !== undefined) row.summary = patch.summary
    if (patch.error !== undefined) row.error = patch.error
    const { data, error } = await this.db
      .from("agent_request")
      .update(row)
      .eq("id", id)
      .eq("campaign_id", this.campaignId)
      .select(REQUEST_COLUMNS)
      .single()
    if (error || !data) throw new StoreError("update request", error)
    return toRequest(data as Row)
  }

  async getRequest(id: string) {
    const { data, error } = await this.db
      .from("agent_request")
      .select(REQUEST_COLUMNS)
      .eq("id", id)
      .eq("campaign_id", this.campaignId)
      .single()
    if (error || !data) throw new StoreError("load request", error)
    return toRequest(data as Row)
  }

  async listRequests(limit = 10) {
    const { data, error } = await this.db
      .from("agent_request")
      .select(REQUEST_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) throw new StoreError("load requests", error)
    return ((data ?? []) as Row[]).map(toRequest)
  }

  /** The newest request still waiting on the user or on a paused agent, if any. */
  async getOpenRequest() {
    const { data, error } = await this.db
      .from("agent_request")
      .select(REQUEST_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .in("status", OPEN_REQUEST_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new StoreError("load open request", error)
    return data ? toRequest(data as Row) : null
  }

  // ---- Tasks ----

  /** Inserts tasks in order; dependsOn holds indexes into the same list and is resolved to task ids. */
  async createTasks(requestId: string, tasks: NewTask[]) {
    const created: AgentTaskRecord[] = []
    // One by one so later tasks can reference the ids of earlier ones
    for (const task of tasks) {
      const { data, error } = await this.db
        .from("agent_task")
        .insert([
          {
            request_id: requestId,
            campaign_id: this.campaignId,
            user_id: this.userId,
            agent_key: task.agentKey,
            title: task.title.slice(0, 200),
            instructions: task.instructions,
            position: task.position,
            depends_on: task.dependsOn.map((i) => created[i].id),
            scheduled_at: iso(task.scheduledAt),
            repeat_rule: task.repeatRule,
            next_run_at: task.repeatRule ? isoOrNull(nextOccurrence(task.repeatRule, task.scheduledAt, 0, task.scheduledAt)) : null,
          },
        ])
        .select(TASK_COLUMNS)
        .single()
      if (error || !data) throw new StoreError("create task", error)
      created.push(toTask(data as Row))
    }
    return created
  }

  async updateTask(id: string, patch: TaskPatch) {
    const row = taskRow(patch)
    const { data, error } = await this.db
      .from("agent_task")
      .update(row)
      .eq("id", id)
      .eq("campaign_id", this.campaignId)
      .select(TASK_COLUMNS)
      .single()
    if (error || !data) throw new StoreError("update task", error)
    return toTask(data as Row)
  }

  async listTasks(requestId: string) {
    const { data, error } = await this.db
      .from("agent_task")
      .select(TASK_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .eq("request_id", requestId)
      .order("position", { ascending: true })
    if (error) throw new StoreError("load tasks", error)
    return ((data ?? []) as Row[]).map(toTask)
  }

  async listTasksForRequests(requestIds: string[]) {
    if (requestIds.length === 0) return []
    const { data, error } = await this.db
      .from("agent_task")
      .select(TASK_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .in("request_id", requestIds)
      .order("position", { ascending: true })
    if (error) throw new StoreError("load tasks", error)
    return ((data ?? []) as Row[]).map(toTask)
  }

  async listAgentTasks(agentKey: AgentKey, limit = 8) {
    const { data, error } = await this.db
      .from("agent_task")
      .select(TASK_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .eq("agent_key", agentKey)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) throw new StoreError("load agent tasks", error)
    return ((data ?? []) as Row[]).map(toTask)
  }

  async getTask(id: string) {
    const { data, error } = await this.db
      .from("agent_task")
      .select(TASK_COLUMNS)
      .eq("id", id)
      .eq("campaign_id", this.campaignId)
      .maybeSingle()
    if (error) throw new StoreError("load task", error)
    return data ? toTask(data as Row) : null
  }

  async listTasksByIds(ids: string[]) {
    if (ids.length === 0) return []
    const { data, error } = await this.db.from("agent_task").select(TASK_COLUMNS).eq("campaign_id", this.campaignId).in("id", ids)
    if (error) throw new StoreError("load tasks", error)
    return ((data ?? []) as Row[]).map(toTask)
  }

  /** Pending tasks due before `before`, optionally for one agent (used to dispatch right away). */
  async listDuePendingTasks(before: number, agentKey?: AgentKey) {
    let query = this.db
      .from("agent_task")
      .select(TASK_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .eq("status", "pending")
      .lte("scheduled_at", iso(before))
    if (agentKey) query = query.eq("agent_key", agentKey)
    const { data, error } = await query.order("scheduled_at", { ascending: true }).limit(100)
    if (error) throw new StoreError("load due tasks", error)
    return ((data ?? []) as Row[]).map(toTask)
  }

  /** Tasks scheduled in the coming period, so the Master Agent can spread new work around them. */
  async listUpcomingTasks(until: number) {
    const { data, error } = await this.db
      .from("agent_task")
      .select(TASK_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .in("status", ["pending", "queued"])
      .lte("scheduled_at", iso(until))
      .order("scheduled_at", { ascending: true })
      .limit(50)
    if (error) throw new StoreError("load upcoming tasks", error)
    return ((data ?? []) as Row[]).map(toTask)
  }

  /**
   * Atomically moves one task pending -> queued if it is still due before `dueBefore`. Returns the
   * task only if this call won the claim, so a task due soon and the cron can never both dispatch it.
   */
  async claimForDispatch(id: string, dueBefore: number) {
    const { data, error } = await this.db
      .from("agent_task")
      .update({ status: "queued", queued_at: iso(Date.now()) })
      .eq("id", id)
      .eq("campaign_id", this.campaignId)
      .eq("status", "pending")
      // Re-checked in the same statement: the task may have been rescheduled since it was read
      .lte("scheduled_at", iso(dueBefore))
      .select(TASK_COLUMNS)
      .maybeSingle()
    if (error) throw new StoreError("claim task", error)
    return data ? toTask(data as Row) : null
  }

  /**
   * Conditional transition for the dispatch identified by queuedAt: only succeeds while the
   * task is still in `from` and was queued by that dispatch. Returns null when someone else moved it.
   */
  async transitionTask(id: string, queuedAt: number, from: TaskStatus | TaskStatus[], patch: TaskPatch) {
    const row = taskRow(patch)
    const { data, error } = await this.db
      .from("agent_task")
      .update(row)
      .eq("id", id)
      .eq("campaign_id", this.campaignId)
      .in("status", Array.isArray(from) ? from : [from])
      .eq("queued_at", iso(queuedAt))
      .select(TASK_COLUMNS)
      .maybeSingle()
    if (error) throw new StoreError("update task", error)
    return data ? toTask(data as Row) : null
  }

  // ---- Runs ----

  /** Records the start of one occurrence. Returns null if that occurrence already has a run. */
  async createRun(task: AgentTaskRecord) {
    const { data, error } = await this.db
      .from("agent_task_run")
      .insert([
        {
          task_id: task.id,
          campaign_id: this.campaignId,
          user_id: this.userId,
          agent_key: task.agentKey,
          scheduled_for: iso(task.scheduledAt),
        },
      ])
      .select(RUN_COLUMNS)
      .single()
    // 23505: unique violation, the occurrence already ran
    if (error && "code" in error && error.code === "23505") return null
    if (error || !data) throw new StoreError("record run", error)
    return toRun(data as Row)
  }

  async getRun(taskId: string, scheduledFor: number) {
    const { data, error } = await this.db
      .from("agent_task_run")
      .select(RUN_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .eq("task_id", taskId)
      .eq("scheduled_for", iso(scheduledFor))
      .maybeSingle()
    if (error) throw new StoreError("load run", error)
    return data ? toRun(data as Row) : null
  }

  async finishRun(id: string, status: TaskRunRecord["status"], result: { output?: string | null; error?: string | null }) {
    const { error } = await this.db
      .from("agent_task_run")
      .update({ status, output: result.output ?? null, error: result.error ?? null, finished_at: iso(Date.now()) })
      .eq("id", id)
      .eq("campaign_id", this.campaignId)
    if (error) throw new StoreError("finish run", error)
  }

  async listRuns(taskIds: string[], limit = 200) {
    if (taskIds.length === 0) return []
    const { data, error } = await this.db
      .from("agent_task_run")
      .select(RUN_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .in("task_id", taskIds)
      .order("scheduled_for", { ascending: false })
      .limit(limit)
    if (error) throw new StoreError("load runs", error)
    return ((data ?? []) as Row[]).map(toRun)
  }

  // ---- Requests (conditional) ----

  /** Moves a request from one status to another only if it is still in `from`. */
  async transitionRequest(id: string, from: RequestStatus[], patch: RequestPatch) {
    const row: Row = {}
    if (patch.status !== undefined) row.status = patch.status
    if (patch.clarificationQuestion !== undefined) row.clarification_question = patch.clarificationQuestion
    if (patch.summary !== undefined) row.summary = patch.summary
    if (patch.error !== undefined) row.error = patch.error
    const { data, error } = await this.db
      .from("agent_request")
      .update(row)
      .eq("id", id)
      .eq("campaign_id", this.campaignId)
      .in("status", from)
      .select(REQUEST_COLUMNS)
      .maybeSingle()
    if (error) throw new StoreError("update request", error)
    return data ? toRequest(data as Row) : null
  }

  // ---- Agent status ----

  async getStates(): Promise<AgentStates> {
    const { data, error } = await this.db
      .from("agent_state")
      .select("agent_key, status")
      .eq("campaign_id", this.campaignId)
    if (error) throw new StoreError("load agent statuses", error)
    const states = Object.fromEntries(THREAD_KEYS.map((k) => [k, "idle"])) as AgentStates
    for (const row of (data ?? []) as Row[]) states[row.agent_key as ThreadKey] = row.status as AgentStatus
    return states
  }

  /**
   * Sets an agent's status. Work-driven updates (working/idle/error) never override a pause
   * the user set; pass force to change a paused agent. Returns the status now stored.
   */
  async setState(agentKey: ThreadKey, status: AgentStatus, currentTaskId: string | null = null, force = false) {
    if (!force && status !== "paused") {
      const { data } = await this.db
        .from("agent_state")
        .select("status")
        .eq("campaign_id", this.campaignId)
        .eq("agent_key", agentKey)
        .maybeSingle()
      if ((data as Row | null)?.status === "paused") return "paused" as const
    }
    const { error } = await this.db
      .from("agent_state")
      .upsert([{ campaign_id: this.campaignId, user_id: this.userId, agent_key: agentKey, status, current_task_id: currentTaskId }], {
        onConflict: "campaign_id,agent_key",
      })
    if (error) throw new StoreError("update agent status", error)
    return status
  }

  // ---- Page data ----

  async snapshot(): Promise<WorkspaceSnapshot> {
    const [threads, requests, states] = await Promise.all([
      Promise.all(THREAD_KEYS.map((t) => this.listMessages(t))),
      this.listRequests(10),
      this.getStates(),
    ])
    const tasks = await this.listTasksForRequests(requests.map((r) => r.id))
    const runs = await this.listRuns(tasks.filter((t) => t.repeatRule).map((t) => t.id))
    return { messages: threads.flat(), requests, tasks, runs, states }
  }
}
