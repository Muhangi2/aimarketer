import type { AgentKey, ComputerAgentKey, ThreadKey } from "@/lib/agent-roles"

// Shared by the server (orchestrator, routes) and the browser (workspace hook, UI)

export type Participant = ThreadKey | "user"

export type MessageKind =
  | "chat"
  | "plan"
  | "assignment"
  | "update"
  | "question"
  | "answer"
  | "result"
  | "review"
  | "clarification"
  | "summary"
  | "error"

export type AgentMessage = {
  id: string
  // Whose chat the message appears in
  thread: ThreadKey
  sender: Participant
  recipient: Participant
  kind: MessageKind
  content: string
  requestId: string | null
  taskId: string | null
  at: number
  // Only in the browser: not saved yet, or a local error that is never sent to the model
  local?: boolean
  error?: boolean
}

export type RequestStatus =
  | "planning"
  | "running"
  | "awaiting_clarification"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"

export type AgentRequestRecord = {
  id: string
  prompt: string
  status: RequestStatus
  clarificationQuestion: string | null
  summary: string | null
  error: string | null
  createdAt: number
  updatedAt: number
}

export type TaskStatus =
  | "pending"
  // Claimed for dispatch; an Inngest run is about to pick it up
  | "queued"
  | "in_progress"
  | "in_review"
  | "needs_input"
  // A computer agent is waiting for the user to log in, solve a captcha or hand back control
  | "waiting_for_user"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled"
  // Nobody responded within 24 hours while the agent waited
  | "expired"

export type AgentTaskRecord = {
  id: string
  requestId: string
  agentKey: AgentKey
  title: string
  instructions: string
  status: TaskStatus
  dependsOn: string[]
  position: number
  clarifications: string | null
  output: string | null
  reviewFeedback: string | null
  attempts: number
  error: string | null
  startedAt: number | null
  completedAt: number | null
  createdAt: number
  updatedAt: number
  // When the task (or its next occurrence, for repeating tasks) runs
  scheduledAt: number
  repeatRule: RepeatRule | null
  nextRunAt: number | null
  runCount: number
  queuedAt: number | null
  lastRunAt: number | null
  // Set while status is waiting_for_user
  waitingReason: string | null
  waitingUrl: string | null
  waitingUntil: number | null
}

export type RepeatRule = {
  every: number
  unit: "hour" | "day" | "week" | "month"
  // Stop after this many runs, or after this date (ISO)
  count?: number
  until?: string
}

export type TaskRunRecord = {
  id: string
  taskId: string
  scheduledFor: number
  status: "running" | "completed" | "failed" | "needs_input"
  output: string | null
  error: string | null
  startedAt: number
  finishedAt: number | null
}

export type AgentStatus = "idle" | "working" | "paused" | "error"

export type AgentStates = Record<ThreadKey, AgentStatus>

// What each agent is doing right now, e.g. "Opening instagram.com"
export type AgentActivities = Record<ThreadKey, string | null>

export type ArtifactKind = "image" | "file" | "link" | "page"
export type ArtifactSource = "generated" | "edited" | "uploaded" | "reported" | "visited" | "campaign_end"

/** A file or link an agent made (or a page it opened), saved as a task result. */
export type ArtifactRecord = {
  id: string
  taskId: string | null
  agentKey: AgentKey
  kind: ArtifactKind
  name: string
  url: string
  mimeType: string | null
  sizeBytes: number | null
  source: ArtifactSource
  createdAt: number
}

export type ComputerStatus = "none" | "starting" | "running" | "pausing" | "paused" | "shut_down" | "error"

/** A computer agent's cloud desktop, as the campaign owner sees it (no secrets). */
export type ComputerRecord = {
  agentKey: ComputerAgentKey
  status: ComputerStatus
  // "user" while the owner has taken over; the agent waits
  control: "agent" | "user"
  currentTaskId: string | null
  activity: string | null
  lastActiveAt: number
  // A saved screenshot exists (shown while paused)
  screenshotAt: number | null
  error: string | null
}

export type CampaignStatus = "active" | "ending" | "ended"

// Everything the agent workspace needs on first render
export type WorkspaceSnapshot = {
  messages: AgentMessage[]
  requests: AgentRequestRecord[]
  tasks: AgentTaskRecord[]
  runs: TaskRunRecord[]
  states: AgentStates
  activities: AgentActivities
  artifacts: ArtifactRecord[]
  computers: ComputerRecord[]
  campaignStatus: CampaignStatus
}

// Progress the Master Agent streams to the browser as newline-delimited JSON
export type OrchestratorEvent =
  | { type: "message"; message: AgentMessage }
  | { type: "request"; request: AgentRequestRecord }
  | { type: "task"; task: AgentTaskRecord }
  | { type: "agent"; agentKey: ThreadKey; status: AgentStatus }
  | { type: "error"; message: string }
  | { type: "done" }

// Requests the Master Agent can still pick back up
export const OPEN_REQUEST_STATUSES: RequestStatus[] = ["awaiting_clarification", "waiting"]

export const ACTIVE_TASK_STATUSES: TaskStatus[] = ["pending", "queued", "in_progress", "in_review", "needs_input", "waiting_for_user"]

// Finished for good: nothing will run again
export const TERMINAL_TASK_STATUSES: TaskStatus[] = ["completed", "failed", "blocked", "cancelled", "expired"]

// Statuses an Inngest run is working on right now
export const RUNNING_TASK_STATUSES: TaskStatus[] = ["queued", "in_progress", "in_review"]

// ---- Structured agent outputs (research findings, content drafts, task results) ----

export const FINDING_KINDS = ["trend", "hashtag", "competitor", "audience", "content_idea", "news", "platform_update", "insight"] as const
export type FindingKind = (typeof FINDING_KINDS)[number]

export const DRAFT_FORMATS = ["post", "caption", "thread", "carousel", "video_script", "story", "hashtags", "content_idea"] as const
export type DraftFormat = (typeof DRAFT_FORMATS)[number]

export type DraftStatus = "draft" | "approved" | "scheduled" | "published" | "archived"

export type SourceLink = { url: string; title: string }

/** Something the Research Agent learned, saved with its sources. */
export type ResearchFindingRecord = {
  id: string
  requestId: string | null
  taskId: string | null
  kind: FindingKind
  platform: string | null
  title: string
  summary: string
  details: string | null
  sources: SourceLink[]
  tags: string[]
  // "web" when it was checked live in the browser
  basis: "knowledge" | "web"
  createdAt: number
}

/** A post, caption, hashtag set or idea the Creator Agent saved as a draft. */
export type ContentDraftRecord = {
  id: string
  requestId: string | null
  taskId: string | null
  platform: string
  format: DraftFormat
  title: string
  body: string
  hashtags: string[]
  callToAction: string | null
  imageUrls: string[]
  notes: string | null
  status: DraftStatus
  createdAt: number
  updatedAt: number
}

/** The approved output of one finished task occurrence. */
export type TaskResultRecord = {
  id: string
  requestId: string | null
  taskId: string | null
  runId: string | null
  agentKey: AgentKey
  taskTitle: string
  requestPrompt: string | null
  summary: string
  output: string
  reviewFeedback: string | null
  imageUrls: string[]
  fileUrls: string[]
  sourceUrls: string[]
  findingIds: string[]
  draftIds: string[]
  usedBrowser: boolean
  createdAt: number
}
