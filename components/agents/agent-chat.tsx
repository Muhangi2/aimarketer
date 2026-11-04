"use client"

import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { ArrowRight, KeyRound, Paperclip, SendHorizonal } from "lucide-react"
import { cn } from "cn"
import { isComputerAgent, participantName, type AgentKey, type ComputerAgentKey, type ThreadKey } from "@/lib/agent-roles"
import type { OfficeSeat } from "@/lib/office-scene"
import type { AgentMessage, AgentTaskRecord, ArtifactRecord, MessageKind } from "@/lib/agents/types"
import { ParticipantAvatar } from "@/components/agents/participant-avatar"
import { ImageStrip, imageUrlsIn } from "@/components/agents/task-artifacts"
import { Button } from "@/components/ui/button"

// Models sometimes ignore the plain-text rule; drop the markdown symbols the chat can't render
function plainText(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^```\w*\n?|```$/gm, "")
}

// Labels for messages that aren't plain chat with the user
const KIND_LABEL: Partial<Record<MessageKind, string>> = {
  plan: "Plan",
  assignment: "Task assigned",
  update: "Update",
  question: "Question",
  answer: "Answer",
  result: "Delivered work",
  review: "Review",
  clarification: "Needs your input",
  summary: "Results",
}

const KIND_TONE: Partial<Record<MessageKind, string>> = {
  plan: "border border-violet-500/25 bg-violet-500/8",
  assignment: "border border-violet-500/25 bg-violet-500/8",
  clarification: "border border-amber-500/30 bg-amber-500/10",
  summary: "border border-emerald-500/25 bg-emerald-500/8",
}

/**
 * Images to show under a message: for delivered work, the task's images; for the Master Agent's
 * results, the images of every task in the request; plus any image links written in the text.
 */
function imagesFor(m: AgentMessage, tasks: AgentTaskRecord[], artifacts: ArtifactRecord[]) {
  let taskIds: Set<string> | null = null
  if (m.kind === "result" && m.taskId) taskIds = new Set([m.taskId])
  else if (m.kind === "summary" && m.requestId) taskIds = new Set(tasks.filter((t) => t.requestId === m.requestId).map((t) => t.id))
  const fromTasks = taskIds ? artifacts.filter((a) => a.kind === "image" && a.taskId && taskIds.has(a.taskId)).map((a) => a.url) : []
  return [...new Set([...fromTasks, ...imageUrlsIn(m.content)])]
}

// An image-ready update shows its picture, so the raw link is left out of the text
function withoutImageLinks(text: string, images: string[]) {
  return images.reduce((t, url) => t.replace(url, ""), text).trim()
}

// Only the newest help request of a request gets the button
function lastHelpMessage(messages: AgentMessage[], requestId: string) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].kind === "clarification" && messages[i].requestId === requestId) return messages[i].id
  }
  return null
}

export function AgentChat({
  owner,
  greeting,
  messages,
  typing,
  activity = null,
  onWatch,
  busy,
  paused,
  disabled = false,
  placeholder,
  userInitial,
  seatFor,
  tasks = [],
  artifacts = [],
  onHelp,
  onSend,
}: {
  // Whose chat this is
  owner: ThreadKey
  greeting: string
  messages: AgentMessage[]
  // Shows the typing indicator: a reply or a task is in progress
  typing: boolean
  // What the agent is doing right now, shown beside the typing dots
  activity?: string | null
  // Opens the agent's live computer view
  onWatch?: () => void
  // A request from the user is still in progress
  busy: boolean
  paused: boolean
  // No new messages (e.g. the campaign ended)
  disabled?: boolean
  placeholder: string
  userInitial: string
  seatFor: (key: AgentKey) => OfficeSeat | null
  // For "Login now" on messages about a task that waits for the user
  tasks?: AgentTaskRecord[]
  // Images agents made, shown under their results
  artifacts?: ArtifactRecord[]
  onHelp?: (key: ComputerAgentKey) => void
  onSend: (text: string) => void
}) {
  const [draft, setDraft] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const last = messages[messages.length - 1]

  // Keep the newest message in view, including while a reply streams in
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages.length, last?.content.length, typing])

  function submit() {
    const text = draft.trim()
    if (!text || busy || disabled) return
    onSend(text)
    setDraft("")
  }

  const avatar = (who: AgentMessage["sender"]) => (
    <ParticipantAvatar who={who} seatFor={seatFor} userInitial={userInitial} className="size-9" />
  )

  return (
    <div className="flex h-[480px] min-h-0 flex-col lg:h-full">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 py-4">
        {/* Greeting is shown, not stored */}
        <div className="flex max-w-[85%] gap-3 animate-in fade-in duration-300">
          {avatar(owner)}
          <div className="rounded-2xl rounded-tl-md bg-muted px-4 py-3 text-sm leading-relaxed whitespace-pre-line">{greeting}</div>
        </div>

        {messages.map((m) => {
          if (m.sender === "user") {
            return (
              <div
                key={m.id}
                className="ml-auto flex max-w-[85%] flex-row-reverse gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300"
              >
                {avatar("user")}
                <div className="text-right">
                  <div
                    className={cn(
                      "rounded-2xl rounded-tr-md bg-accent px-4 py-3 text-left text-sm leading-relaxed whitespace-pre-line text-accent-foreground",
                      m.error && "opacity-60"
                    )}
                  >
                    {m.content}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground" suppressHydrationWarning>
                    {m.error ? "Not sent" : format(m.at, "h:mm a")}
                  </p>
                </div>
              </div>
            )
          }

          // Agent-to-agent traffic (Master <-> this agent) gets a "from -> to" label
          const label = KIND_LABEL[m.kind]
          // The Master Agent asked the user to log in on an agent's computer, and it's still waiting
          const waiting = m.kind === "clarification" && m.requestId
            ? tasks.find((t) => t.status === "waiting_for_user" && t.requestId === m.requestId && isComputerAgent(t.agentKey))
            : undefined
          const between = m.recipient !== "user"
          const images =
            m.kind === "result" || m.kind === "summary" ? imagesFor(m, tasks, artifacts) : m.kind === "update" ? imageUrlsIn(m.content) : []
          // Image-ready updates: a small preview instead of the link
          const imageUpdate = m.kind === "update" && images.length > 0
          return (
            <div key={m.id} className="flex max-w-[85%] gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300">
              {avatar(m.sender)}
              <div className="min-w-0">
                {(between || label) && (
                  <p className="mb-1 flex flex-wrap items-center gap-1 text-[11px] font-medium text-muted-foreground">
                    {between && (
                      <>
                        {participantName(m.sender)}
                        <ArrowRight className="size-3" />
                        {participantName(m.recipient)}
                      </>
                    )}
                    {label && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">{label}</span>
                    )}
                  </p>
                )}
                <div
                  className={cn(
                    "rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-relaxed whitespace-pre-line",
                    m.error || m.kind === "error" ? "bg-destructive/10 text-destructive" : (KIND_TONE[m.kind] ?? "bg-muted")
                  )}
                >
                  {plainText(imageUpdate ? withoutImageLinks(m.content, images) : m.content)}
                  <ImageStrip urls={images} small={imageUpdate} className="mt-3 whitespace-normal" />
                  {waiting && onHelp && m.id === lastHelpMessage(messages, waiting.requestId) && (
                    <Button size="sm" className="mt-3 flex h-8 rounded-lg" onClick={() => onHelp(waiting.agentKey as ComputerAgentKey)}>
                      <KeyRound /> Login now
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground" suppressHydrationWarning>
                  {format(m.at, "h:mm a")}
                </p>
              </div>
            </div>
          )
        })}

        {typing && (
          <div className="flex gap-3 animate-in fade-in duration-300">
            {avatar(owner)}
            <div
              className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-muted px-4 py-3.5"
              aria-label={`${participantName(owner)} is working`}
            >
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 animate-bounce rounded-full bg-primary/70" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
              {activity && <span className="ml-2 max-w-64 truncate text-xs text-muted-foreground">{activity}</span>}
              {onWatch && (
                <button type="button" onClick={onWatch} className="ml-2 shrink-0 text-xs font-medium text-primary hover:underline">
                  Watch live
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex shrink-0 items-end gap-2 rounded-2xl border bg-background p-2 shadow-xs transition-shadow focus-within:border-primary/40 focus-within:ring-3 focus-within:ring-primary/10"
      >
        <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 rounded-xl text-muted-foreground" aria-label="Attach a file" disabled>
          <Paperclip />
        </Button>
        <textarea
          value={draft}
          rows={1}
          disabled={disabled}
          aria-label="Message"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={
            busy ? `${participantName(owner)} is working…` : paused ? `${participantName(owner)} is paused` : placeholder
          }
          className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none field-sizing-content placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          size="icon"
          className={cn("size-9 shrink-0 rounded-xl shadow-sm shadow-primary/30 transition-transform", draft.trim() && !busy && "scale-105")}
          disabled={!draft.trim() || busy || disabled}
          aria-label="Send"
        >
          <SendHorizonal />
        </Button>
      </form>
    </div>
  )
}
