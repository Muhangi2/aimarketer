"use client"

import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { ArrowRight, Paperclip, SendHorizonal } from "lucide-react"
import { cn } from "cn"
import { participantName, type AgentKey, type ThreadKey } from "@/lib/agent-roles"
import type { OfficeSeat } from "@/lib/office-scene"
import type { AgentMessage, MessageKind } from "@/lib/agents/types"
import { ParticipantAvatar } from "@/components/agents/participant-avatar"
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

export function AgentChat({
  owner,
  greeting,
  messages,
  typing,
  busy,
  paused,
  placeholder,
  userInitial,
  seatFor,
  onSend,
}: {
  // Whose chat this is
  owner: ThreadKey
  greeting: string
  messages: AgentMessage[]
  // Shows the typing indicator: a reply or a task is in progress
  typing: boolean
  // A request from the user is still in progress
  busy: boolean
  paused: boolean
  placeholder: string
  userInitial: string
  seatFor: (key: AgentKey) => OfficeSeat | null
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
    if (!text || busy) return
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
          const between = m.recipient !== "user"
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
                  {plainText(m.content)}
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
          disabled={!draft.trim() || busy}
          aria-label="Send"
        >
          <SendHorizonal />
        </Button>
      </form>
    </div>
  )
}
