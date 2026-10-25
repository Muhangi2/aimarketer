"use client"

import { useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { Paperclip, SendHorizonal } from "lucide-react"
import { cn } from "cn"
import type { OfficeSeat } from "@/lib/office-scene"
import { AgentAvatar } from "@/components/agents/agent-avatar"
import { Button } from "@/components/ui/button"

export type ChatMessage = {
  id: string
  from: "agent" | "user"
  text: string
  at: number
  // Shown in the chat but never sent back to the model
  error?: boolean
}

// Models sometimes ignore the plain-text rule; drop the markdown symbols the chat can't render
function plainText(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^```\w*\n?|```$/gm, "")
}

export function AgentChat({
  seat,
  messages,
  typing,
  busy,
  paused,
  userInitial,
  onSend,
}: {
  seat: OfficeSeat
  messages: ChatMessage[]
  typing: boolean
  // A reply is still streaming in
  busy: boolean
  paused: boolean
  userInitial: string
  onSend: (text: string) => void
}) {
  const [draft, setDraft] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const last = messages[messages.length - 1]

  // Keep the newest message in view, including while a reply streams in
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages.length, last?.text.length, typing])

  function submit() {
    const text = draft.trim()
    if (!text || busy) return
    onSend(text)
    setDraft("")
  }

  return (
    <div className="flex h-[480px] min-h-0 flex-col lg:h-full">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 py-4">
        {messages.map((m) =>
          m.from === "agent" ? (
            <div key={m.id} className="flex max-w-[85%] gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300">
              <AgentAvatar seat={seat} className="size-9" />
              <div>
                <div
                  className={cn(
                    "rounded-2xl rounded-tl-md px-4 py-3 text-sm leading-relaxed whitespace-pre-line",
                    m.error ? "bg-destructive/10 text-destructive" : "bg-muted"
                  )}
                >
                  {plainText(m.text)}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground" suppressHydrationWarning>
                  {format(m.at, "h:mm a")}
                </p>
              </div>
            </div>
          ) : (
            <div
              key={m.id}
              className="ml-auto flex max-w-[85%] flex-row-reverse gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {userInitial}
              </span>
              <div className="text-right">
                <div className="rounded-2xl rounded-tr-md bg-accent px-4 py-3 text-left text-sm leading-relaxed whitespace-pre-line text-accent-foreground">
                  {m.text}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground" suppressHydrationWarning>
                  {format(m.at, "h:mm a")}
                </p>
              </div>
            </div>
          )
        )}

        {typing && (
          <div className="flex gap-3 animate-in fade-in duration-300">
            <AgentAvatar seat={seat} className="size-9" />
            <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-muted px-4 py-3.5" aria-label={`${seat.role.name} is typing`}>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-primary/70"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={
            busy
              ? `${seat.role.name} is replying…`
              : paused
                ? `${seat.role.name} is paused`
                : `Give a task to your ${seat.role.name}…`
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
