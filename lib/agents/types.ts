import type { AgentKey, ThreadKey } from "@/lib/agent-roles"

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
  | "in_progress"
  | "in_review"
  | "needs_input"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled"

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
}

export type AgentStatus = "idle" | "working" | "paused" | "error"

export type AgentStates = Record<ThreadKey, AgentStatus>

// Everything the agent workspace needs on first render
export type WorkspaceSnapshot = {
  messages: AgentMessage[]
  requests: AgentRequestRecord[]
  tasks: AgentTaskRecord[]
  states: AgentStates
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

export const ACTIVE_TASK_STATUSES: TaskStatus[] = ["pending", "in_progress", "in_review", "needs_input"]
