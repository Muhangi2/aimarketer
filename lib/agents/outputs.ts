import "server-only"
import type { createServerClient } from "@insforge/sdk/ssr"
import type { AgentKey } from "@/lib/agent-roles"
import { StoreError } from "@/lib/agents/store"
import type {
  ContentDraftRecord,
  DraftFormat,
  DraftStatus,
  FindingKind,
  ResearchFindingRecord,
  SourceLink,
  TaskResultRecord,
} from "@/lib/agents/types"
import { getInsForgeAdmin } from "@/lib/insforge/admin"

/*
 * Structured outputs of the agents' tools: research findings, content drafts, and one result
 * record per finished task. Background jobs write with the admin client; the owner's client
 * (RLS) reads and searches them.
 */

type DatabaseClient = { database: ReturnType<typeof createServerClient>["database"] }
type Row = Record<string, unknown>

const FINDING_COLUMNS = "id, request_id, task_id, kind, platform, title, summary, details, sources, tags, basis, created_at"
const DRAFT_COLUMNS =
  "id, request_id, task_id, platform, format, title, body, hashtags, call_to_action, image_urls, notes, status, created_at, updated_at"
const RESULT_COLUMNS =
  "id, request_id, task_id, run_id, agent_key, task_title, request_prompt, summary, output, review_feedback, image_urls, file_urls, source_urls, finding_ids, draft_ids, used_browser, created_at"

const time = (v: unknown) => (v ? new Date(String(v)).getTime() : 0)
const str = (v: unknown) => (v == null ? null : String(v))
const strings = (v: unknown) => (Array.isArray(v) ? v.map(String) : [])

function toFinding(r: Row): ResearchFindingRecord {
  return {
    id: String(r.id),
    requestId: str(r.request_id),
    taskId: str(r.task_id),
    kind: r.kind as FindingKind,
    platform: str(r.platform),
    title: String(r.title),
    summary: String(r.summary),
    details: str(r.details),
    sources: Array.isArray(r.sources) ? (r.sources as SourceLink[]) : [],
    tags: strings(r.tags),
    basis: r.basis === "web" ? "web" : "knowledge",
    createdAt: time(r.created_at),
  }
}

function toDraft(r: Row): ContentDraftRecord {
  return {
    id: String(r.id),
    requestId: str(r.request_id),
    taskId: str(r.task_id),
    platform: String(r.platform),
    format: r.format as DraftFormat,
    title: String(r.title),
    body: String(r.body),
    hashtags: strings(r.hashtags),
    callToAction: str(r.call_to_action),
    imageUrls: strings(r.image_urls),
    notes: str(r.notes),
    status: r.status as DraftStatus,
    createdAt: time(r.created_at),
    updatedAt: time(r.updated_at),
  }
}

function toResult(r: Row): TaskResultRecord {
  return {
    id: String(r.id),
    requestId: str(r.request_id),
    taskId: str(r.task_id),
    runId: str(r.run_id),
    agentKey: r.agent_key as AgentKey,
    taskTitle: String(r.task_title),
    requestPrompt: str(r.request_prompt),
    summary: String(r.summary),
    output: String(r.output),
    reviewFeedback: str(r.review_feedback),
    imageUrls: strings(r.image_urls),
    fileUrls: strings(r.file_urls),
    sourceUrls: strings(r.source_urls),
    findingIds: strings(r.finding_ids),
    draftIds: strings(r.draft_ids),
    usedBrowser: Boolean(r.used_browser),
    createdAt: time(r.created_at),
  }
}

// Hashtags are stored without "#" duplicates or spaces, always starting with "#"
export function cleanHashtags(tags: string[]) {
  const seen = new Set<string>()
  for (const tag of tags) {
    const t = tag.trim().replace(/^#+/, "").replace(/\s+/g, "")
    if (t) seen.add(`#${t}`)
  }
  return [...seen].slice(0, 40)
}

export type NewFinding = {
  requestId: string | null
  taskId: string | null
  kind: FindingKind
  platform?: string | null
  title: string
  summary: string
  details?: string | null
  sources?: SourceLink[]
  tags?: string[]
  basis: "knowledge" | "web"
}

export type NewDraft = {
  requestId: string | null
  taskId: string | null
  platform: string
  format: DraftFormat
  title: string
  body: string
  hashtags?: string[]
  callToAction?: string | null
  imageUrls?: string[]
  notes?: string | null
}

export type NewTaskResult = Omit<TaskResultRecord, "id" | "createdAt">

export type OutputKind = "results" | "findings" | "drafts"

type SearchQuery = {
  eq(column: string, value: unknown): SearchQuery
  textSearch(column: string, query: string, options: { type: "websearch"; config: string }): SearchQuery
  order(column: string, options: { ascending: boolean }): SearchQuery
  limit(count: number): PromiseLike<{ data: unknown; error: unknown }>
}

export class OutputStore {
  constructor(
    private readonly client: DatabaseClient,
    readonly campaignId: string,
    readonly userId: string
  ) {}

  /** Admin-backed store for background jobs. */
  static admin(campaignId: string, userId: string) {
    return new OutputStore(getInsForgeAdmin(), campaignId, userId)
  }

  private get db() {
    return this.client.database
  }

  private owner() {
    return { campaign_id: this.campaignId, user_id: this.userId }
  }

  // ---- Writes (background jobs) ----

  async addFinding(f: NewFinding) {
    const { data, error } = await this.db
      .from("research_finding")
      .insert([
        {
          ...this.owner(),
          request_id: f.requestId,
          task_id: f.taskId,
          kind: f.kind,
          platform: f.platform?.trim().toLowerCase() || null,
          title: f.title.trim().slice(0, 300),
          summary: f.summary.trim().slice(0, 4000),
          details: f.details?.trim().slice(0, 12000) || null,
          sources: (f.sources ?? []).slice(0, 20),
          tags: (f.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20),
          basis: f.basis,
        },
      ])
      .select(FINDING_COLUMNS)
      .single()
    if (error) throw new StoreError("save research finding", error)
    return toFinding(data as Row)
  }

  async addDraft(d: NewDraft) {
    const { data, error } = await this.db
      .from("content_draft")
      .insert([
        {
          ...this.owner(),
          request_id: d.requestId,
          task_id: d.taskId,
          platform: d.platform.trim().toLowerCase().slice(0, 40),
          format: d.format,
          title: d.title.trim().slice(0, 300),
          body: d.body.trim().slice(0, 12000),
          hashtags: cleanHashtags(d.hashtags ?? []),
          call_to_action: d.callToAction?.trim() || null,
          image_urls: (d.imageUrls ?? []).slice(0, 20),
          notes: d.notes?.trim() || null,
        },
      ])
      .select(DRAFT_COLUMNS)
      .single()
    if (error) throw new StoreError("save content draft", error)
    return toDraft(data as Row)
  }

  /** One record per finished occurrence; saving the same run twice keeps the first. */
  async saveTaskResult(r: NewTaskResult) {
    const { error } = await this.db.from("agent_task_result").upsert(
      [
        {
          ...this.owner(),
          request_id: r.requestId,
          task_id: r.taskId,
          run_id: r.runId,
          agent_key: r.agentKey,
          task_title: r.taskTitle,
          request_prompt: r.requestPrompt,
          summary: r.summary.slice(0, 2000),
          output: r.output,
          review_feedback: r.reviewFeedback,
          image_urls: r.imageUrls,
          file_urls: r.fileUrls,
          source_urls: r.sourceUrls.slice(0, 50),
          finding_ids: r.findingIds,
          draft_ids: r.draftIds,
          used_browser: r.usedBrowser,
        },
      ],
      { onConflict: "run_id", ignoreDuplicates: true }
    )
    if (error) throw new StoreError("save task result", error)
  }

  // ---- Reads ----

  async listTaskFindings(taskId: string) {
    const { data, error } = await this.db
      .from("research_finding")
      .select(FINDING_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true })
    if (error) throw new StoreError("load research findings", error)
    return ((data ?? []) as Row[]).map(toFinding)
  }

  /** The findings saved for one request, newest first: what the Creator Agent writes from. */
  async listRequestFindings(requestId: string, limit = 10) {
    const { data, error } = await this.db
      .from("research_finding")
      .select(FINDING_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error) throw new StoreError("load research findings", error)
    return ((data ?? []) as Row[]).map(toFinding)
  }

  async listTaskDrafts(taskId: string) {
    const { data, error } = await this.db
      .from("content_draft")
      .select(DRAFT_COLUMNS)
      .eq("campaign_id", this.campaignId)
      .eq("task_id", taskId)
      .order("created_at", { ascending: true })
    if (error) throw new StoreError("load content drafts", error)
    return ((data ?? []) as Row[]).map(toDraft)
  }

  /**
   * Searches past outputs. `q` is matched with Postgres full-text search (words, "quoted
   * phrases", -excluded); without it the newest come first.
   */
  async search(kind: OutputKind, { q, agentKey, taskId, limit = 50 }: { q?: string; agentKey?: AgentKey; taskId?: string; limit?: number } = {}) {
    const table: string = kind === "results" ? "agent_task_result" : kind === "findings" ? "research_finding" : "content_draft"
    const columns: string = kind === "results" ? RESULT_COLUMNS : kind === "findings" ? FINDING_COLUMNS : DRAFT_COLUMNS
    // The table is picked at runtime, so the builder is typed loosely here
    let query = (this.db.from(table).select(columns) as unknown as SearchQuery).eq("campaign_id", this.campaignId)
    if (taskId) query = query.eq("task_id", taskId)
    if (agentKey && kind === "results") query = query.eq("agent_key", agentKey)
    if (q?.trim()) query = query.textSearch("search", q.trim(), { type: "websearch", config: "english" })
    const { data, error } = await query.order("created_at", { ascending: false }).limit(Math.min(limit, 200))
    if (error) throw new StoreError(`search ${kind}`, error)
    const rows = (data ?? []) as unknown as Row[]
    return kind === "results" ? rows.map(toResult) : kind === "findings" ? rows.map(toFinding) : rows.map(toDraft)
  }

  async setDraftStatus(draftId: string, status: DraftStatus) {
    const { data, error } = await this.db
      .from("content_draft")
      .update({ status })
      .eq("campaign_id", this.campaignId)
      .eq("id", draftId)
      .select(DRAFT_COLUMNS)
      .maybeSingle()
    if (error) throw new StoreError("update content draft", error)
    return data ? toDraft(data as Row) : null
  }
}
