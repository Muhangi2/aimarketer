"use client"

import { useState } from "react"
import { Send, Sparkles, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

/**
 * Where the user writes or AI-drafts a reply, edits it, and sends it. Nothing goes out until
 * they click Send.
 */
export function ReplyBox({
  placeholder,
  onDraft,
  onSend,
  autoFocus,
  note,
}: {
  placeholder: string
  // Returns the AI draft, or throws with a message
  onDraft: (instruction: string | null) => Promise<string>
  // Returns an error message, or null when sent
  onSend: (text: string) => Promise<string | null>
  autoFocus?: boolean
  note?: string | null
}) {
  const [text, setText] = useState("")
  const [instruction, setInstruction] = useState("")
  const [showInstruction, setShowInstruction] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafted, setDrafted] = useState(false)

  async function draft() {
    setDrafting(true)
    setError(null)
    try {
      setText(await onDraft(instruction.trim() || null))
      setDrafted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draft a reply.")
    } finally {
      setDrafting(false)
    }
  }

  async function send() {
    if (!text.trim()) return
    setSending(true)
    setError(null)
    const problem = await onSend(text.trim())
    setSending(false)
    if (problem) {
      setError(problem)
      return
    }
    setText("")
    setInstruction("")
    setDrafted(false)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-background p-2 shadow-xs">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="min-h-20 resize-y border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void send()
          }
        }}
      />
      {showInstruction && (
        <Input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Tell the AI what to say, e.g. thank them and point them to the link in bio"
          className="h-8 text-xs"
          maxLength={500}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={draft} disabled={drafting || sending} className="border-violet-500/30 text-violet-700 hover:bg-violet-500/10 dark:text-violet-300">
          {drafting ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
          {drafting ? "Drafting…" : drafted ? "Draft again" : "Draft with AI"}
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={() => setShowInstruction((v) => !v)} aria-label="Guide the AI draft" title="Guide the AI draft">
          <Wand2 />
        </Button>
        {drafted && !error && <span className="text-[11px] text-muted-foreground">AI draft. Check it before sending.</span>}
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Button size="sm" onClick={send} disabled={sending || drafting || !text.trim()} className="ml-auto">
          {sending ? <Spinner data-icon="inline-start" /> : <Send data-icon="inline-start" />}
          Send
        </Button>
      </div>
      {note && <p className="px-1 text-[11px] text-muted-foreground">{note}</p>}
    </div>
  )
}
