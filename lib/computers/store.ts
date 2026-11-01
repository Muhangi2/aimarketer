import "server-only"
import type { ComputerAgentKey } from "@/lib/agent-roles"
import { iso } from "@/lib/agents/schedule"
import { ARTIFACT_COLUMNS, COMPUTER_COLUMNS, StoreError, toArtifact, toComputer } from "@/lib/agents/store"
import { TERMINAL_TASK_STATUSES, type ArtifactKind, type ArtifactSource, type ComputerRecord, type ComputerStatus } from "@/lib/agents/types"
import { getInsForgeAdmin } from "@/lib/insforge/admin"

/*
 * Server-only access to agent computers. Uses the admin client: secrets and saved runs are never
 * readable by signed-in users, so every query filters by campaign (and user) itself.
 */

type Row = Record<string, unknown>

export type ComputerRow = ComputerRecord & { campaignId: string; userId: string; sandboxId: string | null }

export type ComputerPatch = Partial<{
  sandboxId: string | null
  status: ComputerStatus
  control: "agent" | "user"
  activity: string | null
  lastActiveAt: number
  screenshotAt: number | null
  error: string | null
}>

function computerRow(patch: ComputerPatch) {
  const row: Row = {}
  if (patch.sandboxId !== undefined) row.sandbox_id = patch.sandboxId
  if (patch.status !== undefined) row.status = patch.status
  if (patch.control !== undefined) row.control = patch.control
  if (patch.activity !== undefined) row.activity = patch.activity?.slice(0, 200) ?? null
  if (patch.lastActiveAt !== undefined) row.last_active_at = iso(patch.lastActiveAt)
  if (patch.screenshotAt !== undefined) row.screenshot_at = patch.screenshotAt == null ? null : iso(patch.screenshotAt)
  if (patch.error !== undefined) row.error = patch.error
  return row
}

const toRow = (r: Row): ComputerRow => ({
  ...toComputer(r),
  campaignId: String(r.campaign_id),
  userId: String(r.user_id),
  sandboxId: r.sandbox_id == null ? null : String(r.sandbox_id),
})

const COLUMNS = `campaign_id, user_id, sandbox_id, ${COMPUTER_COLUMNS}`

export type NewArtifact = {
  taskId: string | null
  agentKey: string
  kind: ArtifactKind
  name: string
  url: string
  mimeType?: string | null
  sizeBytes?: number | null
  source: ArtifactSource
}

export class ComputerStore {
  constructor(
    readonly campaignId: string,
    readonly userId: string
  ) {}

  private get db() {
    return getInsForgeAdmin().database
  }

  // ---- Computers ----

  async get(agentKey: ComputerAgentKey) {
    const { data, error } = await this.db
      .from("agent_computer")
      .select(COLUMNS)
      .eq("campaign_id", this.campaignId)
      .eq("user_id", this.userId)
      .eq("agent_key", agentKey)
      .maybeSingle()
    if (error) throw new StoreError("load computer", error)
    return data ? toRow(data as Row) : null
  }

  /** The computer's row, created (status "none") if this agent never had one. */
  async ensure(agentKey: ComputerAgentKey) {
    const existing = await this.get(agentKey)
    if (existing) return existing
    const { error } = await this.db
      .from("agent_computer")
      .upsert([{ campaign_id: this.campaignId, user_id: this.userId, agent_key: agentKey }], {
        onConflict: "campaign_id,agent_key",
        ignoreDuplicates: true,
      })
    if (error) throw new StoreError("create computer", error)
    const created = await this.get(agentKey)
    if (!created) throw new StoreError("create computer", "not found after insert")
    return created
  }

  async update(agentKey: ComputerAgentKey, patch: ComputerPatch) {
    const { data, error } = await this.db
      .from("agent_computer")
      .update(computerRow(patch))
      .eq("campaign_id", this.campaignId)
      .eq("user_id", this.userId)
      .eq("agent_key", agentKey)
      .select(COLUMNS)
      .maybeSingle()
    if (error) throw new StoreError("update computer", error)
    return data ? toRow(data as Row) : null
  }

  /** Changes the computer only while it is still in one of the given statuses. */
  async transition(agentKey: ComputerAgentKey, from: ComputerStatus[], patch: ComputerPatch) {
    const { data, error } = await this.db
      .from("agent_computer")
      .update(computerRow(patch))
      .eq("campaign_id", this.campaignId)
      .eq("user_id", this.userId)
      .eq("agent_key", agentKey)
      .in("status", from)
      .select(COLUMNS)
      .maybeSingle()
    if (error) throw new StoreError("update computer", error)
    return data ? toRow(data as Row) : null
  }

  /** Marks the computer as used now, so it isn't paused for being idle. */
  async touch(agentKey: ComputerAgentKey, activity?: string | null) {
    await this.update(agentKey, { lastActiveAt: Date.now(), ...(activity !== undefined ? { activity } : {}) })
  }

  /**
   * Reserves the computer for one task: each agent runs one task at a time on its computer.
   * A lock left behind by a task that already finished is taken over. Returns the id of the
   * task holding the computer, which is `taskId` when the lock was won.
   */
  async acquire(agentKey: ComputerAgentKey, taskId: string): Promise<string> {
    const computer = await this.ensure(agentKey)
    if (computer.currentTaskId === taskId) return taskId
    if (computer.currentTaskId) {
      const { data } = await this.db.from("agent_task").select("status").eq("id", computer.currentTaskId).maybeSingle()
      const holderStatus = (data as Row | null)?.status as string | undefined
      if (holderStatus && !TERMINAL_TASK_STATUSES.includes(holderStatus as never) && holderStatus !== "needs_input" && holderStatus !== "pending") {
        return computer.currentTaskId
      }
    }
    let query = this.db
      .from("agent_computer")
      .update({ current_task_id: taskId, control: "agent" })
      .eq("campaign_id", this.campaignId)
      .eq("agent_key", agentKey)
    query = computer.currentTaskId ? query.eq("current_task_id", computer.currentTaskId) : query.is("current_task_id", null)
    const { data, error } = await query.select("current_task_id").maybeSingle()
    if (error) throw new StoreError("reserve computer", error)
    if (data) return taskId
    // Someone else won the race
    return (await this.get(agentKey))?.currentTaskId ?? taskId
  }

  /** Frees the computer if this task holds it. */
  async release(agentKey: ComputerAgentKey, taskId: string) {
    const { error } = await this.db
      .from("agent_computer")
      .update({ current_task_id: null, activity: null })
      .eq("campaign_id", this.campaignId)
      .eq("agent_key", agentKey)
      .eq("current_task_id", taskId)
    if (error) throw new StoreError("free computer", error)
  }

  // ---- Secrets: the stream password and the paused-desktop screenshot ----

  async getSecret(agentKey: ComputerAgentKey) {
    const { data, error } = await this.db
      .from("agent_computer_secret")
      .select("stream_key, screenshot")
      .eq("campaign_id", this.campaignId)
      .eq("agent_key", agentKey)
      .maybeSingle()
    if (error) throw new StoreError("load computer secret", error)
    const row = data as Row | null
    return { streamKey: row?.stream_key ? String(row.stream_key) : null, screenshot: row?.screenshot ? String(row.screenshot) : null }
  }

  async setSecret(agentKey: ComputerAgentKey, patch: { streamKey?: string | null; screenshot?: string | null }) {
    const row: Row = { campaign_id: this.campaignId, agent_key: agentKey, updated_at: iso(Date.now()) }
    if (patch.streamKey !== undefined) row.stream_key = patch.streamKey
    if (patch.screenshot !== undefined) row.screenshot = patch.screenshot
    const { error } = await this.db.from("agent_computer_secret").upsert([row], { onConflict: "campaign_id,agent_key" })
    if (error) throw new StoreError("save computer secret", error)
  }

  async deleteSecret(agentKey: ComputerAgentKey) {
    const { error } = await this.db.from("agent_computer_secret").delete().eq("campaign_id", this.campaignId).eq("agent_key", agentKey)
    if (error) throw new StoreError("delete computer secret", error)
  }

  // ---- Saved agent runs (RunState) ----

  async getRunState(taskId: string) {
    const { data, error } = await this.db
      .from("agent_run_state")
      .select("attempt, state")
      .eq("campaign_id", this.campaignId)
      .eq("task_id", taskId)
      .maybeSingle()
    if (error) throw new StoreError("load saved run", error)
    const row = data as Row | null
    return row ? { attempt: Number(row.attempt), state: String(row.state) } : null
  }

  async saveRunState(taskId: string, attempt: number, state: string) {
    const { error } = await this.db
      .from("agent_run_state")
      .upsert([{ task_id: taskId, campaign_id: this.campaignId, attempt, state, updated_at: iso(Date.now()) }], { onConflict: "task_id" })
    if (error) throw new StoreError("save run", error)
  }

  async deleteRunState(taskId: string) {
    const { error } = await this.db.from("agent_run_state").delete().eq("campaign_id", this.campaignId).eq("task_id", taskId)
    if (error) throw new StoreError("delete saved run", error)
  }

  // ---- Files and links ----

  async addArtifact(artifact: NewArtifact) {
    const { data, error } = await this.db
      .from("agent_artifact")
      .insert([
        {
          campaign_id: this.campaignId,
          user_id: this.userId,
          task_id: artifact.taskId,
          agent_key: artifact.agentKey,
          kind: artifact.kind,
          name: artifact.name.slice(0, 300),
          url: artifact.url,
          mime_type: artifact.mimeType ?? null,
          size_bytes: artifact.sizeBytes ?? null,
          source: artifact.source,
        },
      ])
      .select(ARTIFACT_COLUMNS)
      .maybeSingle()
    // 23505: a page already listed for this task
    if (error && "code" in error && error.code === "23505") return null
    if (error) throw new StoreError("save file", error)
    return data ? toArtifact(data as Row) : null
  }

  async listTaskArtifacts(taskId: string) {
    const { data, error } = await this.db
      .from("agent_artifact")
      .select(ARTIFACT_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true })
    if (error) throw new StoreError("load files", error)
    return ((data ?? []) as Row[]).map(toArtifact)
  }
}

/** Every running desktop untouched since `before`, across all campaigns (for the idle pauser). */
export async function listIdleComputers(before: number) {
  const { data, error } = await getInsForgeAdmin()
    .database.from("agent_computer")
    .select(COLUMNS)
    .eq("status", "running")
    .lt("last_active_at", iso(before))
    .limit(200)
  if (error) throw new StoreError("load idle computers", error)
  return ((data ?? []) as Row[]).map(toRow)
}
