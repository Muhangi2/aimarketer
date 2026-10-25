"use client"

import { useEffect, useRef, useState } from "react"
import type { OfficeSeat } from "@/lib/office-scene"
import type { ChatMessage } from "@/components/agents/agent-chat"
import type { AgentTask } from "@/components/agents/agent-history"

let idCounter = 0
const nextId = () => `${Date.now()}-${++idCounter}`

function greeting(seat: OfficeSeat): ChatMessage {
  return { id: `greeting-${seat.id}`, from: "agent", text: seat.role.greeting, at: Date.now() }
}

function toggled(set: ReadonlySet<string>, id: string, on: boolean) {
  const next = new Set(set)
  if (on) next.add(id)
  else next.delete(id)
  return next
}

// POSTs the conversation, refreshing the session once if the access token has expired
async function requestReply(agentKey: string, body: string, signal: AbortSignal) {
  const post = () =>
    fetch(`/api/agents/${agentKey}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    })

  let res = await post()
  if (res.status === 401) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", signal })
    if (refreshed.ok) res = await post()
  }
  return res
}

/**
 * Selection, chats, tasks and pause state for the agents in an office, with replies
 * streamed from the AI agents. Shared by the AI Agent page and the Overview page.
 */
export function useAgentWorkspace(seats: OfficeSeat[], initialSeatId: string | null, campaignId: string) {
  const [selectedId, setSelectedId] = useState(() => seats.find((s) => s.id === initialSeatId)?.id ?? null)
  const [paused, setPaused] = useState<ReadonlySet<string>>(new Set())
  // Agents waiting for the first words of a reply
  const [typing, setTyping] = useState<ReadonlySet<string>>(new Set())
  // Agents with a reply in progress
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>(() =>
    Object.fromEntries(seats.map((s) => [s.id, [greeting(s)]]))
  )
  const [tasks, setTasks] = useState<Record<string, AgentTask[]>>({})
  const requests = useRef(new Map<string, AbortController>())

  useEffect(() => {
    const pending = requests.current
    return () => pending.forEach((c) => c.abort())
  }, [])

  function select(seatId: string | null) {
    setSelectedId(seatId)
    // Keep the selection shareable without a server round trip
    const url = new URL(window.location.href)
    if (seatId) url.searchParams.set("agent", seatId)
    else url.searchParams.delete("agent")
    window.history.replaceState(null, "", url)
  }

  function togglePause(seatId: string) {
    setPaused((prev) => toggled(prev, seatId, !prev.has(seatId)))
  }

  function appendMessage(seatId: string, message: ChatMessage) {
    setChats((prev) => ({ ...prev, [seatId]: [...(prev[seatId] ?? []), message] }))
  }

  function updateMessage(seatId: string, messageId: string, text: string) {
    setChats((prev) => ({
      ...prev,
      [seatId]: (prev[seatId] ?? []).map((m) => (m.id === messageId ? { ...m, text } : m)),
    }))
  }

  function setTaskStatus(seatId: string, taskId: string, status: AgentTask["status"]) {
    setTasks((prev) => ({
      ...prev,
      [seatId]: (prev[seatId] ?? []).map((t) => (t.id === taskId ? { ...t, status } : t)),
    }))
  }

  async function send(seat: OfficeSeat, text: string) {
    if (busy.has(seat.id)) return
    const isPaused = paused.has(seat.id)
    const userMessage: ChatMessage = { id: nextId(), from: "user", text, at: Date.now() }
    const history = [...(chats[seat.id] ?? []), userMessage]

    appendMessage(seat.id, userMessage)
    setTasks((prev) => ({
      ...prev,
      [seat.id]: [...(prev[seat.id] ?? []), { id: userMessage.id, text, status: isPaused ? "waiting" : "working", at: Date.now() }],
    }))

    if (isPaused) {
      appendMessage(seat.id, {
        id: nextId(),
        from: "agent",
        text: "I'm paused right now. I've saved this task and will pick it up once you resume me.",
        at: Date.now(),
      })
      return
    }

    const controller = new AbortController()
    requests.current.set(seat.id, controller)
    setBusy((prev) => toggled(prev, seat.id, true))
    setTyping((prev) => toggled(prev, seat.id, true))

    const replyId = nextId()
    let reply = ""
    try {
      const res = await requestReply(
        seat.role.key,
        JSON.stringify({
          campaignId,
          messages: history
            .filter((m) => !m.error)
            .map((m) => ({ role: m.from === "user" ? "user" : "assistant", content: m.text })),
        }),
        controller.signal
      )
      if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: null }))
        throw new Error(error ?? "Something went wrong.")
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!reply) {
          setTyping((prev) => toggled(prev, seat.id, false))
          appendMessage(seat.id, { id: replyId, from: "agent", text: value, at: Date.now() })
        } else {
          updateMessage(seat.id, replyId, reply + value)
        }
        reply += value
      }
      if (!reply.trim()) throw new Error("The agent didn't reply. Please try again.")
      setTaskStatus(seat.id, userMessage.id, "done")
    } catch (error) {
      if (controller.signal.aborted) return
      setTaskStatus(seat.id, userMessage.id, "failed")
      const message = error instanceof Error ? error.message : "Something went wrong."
      const text = `${reply ? `${reply}\n\n` : ""}⚠️ ${message}`
      if (reply) updateMessage(seat.id, replyId, text)
      else appendMessage(seat.id, { id: replyId, from: "agent", text, at: Date.now(), error: true })
    } finally {
      requests.current.delete(seat.id)
      setTyping((prev) => toggled(prev, seat.id, false))
      setBusy((prev) => toggled(prev, seat.id, false))
    }
  }

  function clearChat(seat: OfficeSeat) {
    requests.current.get(seat.id)?.abort()
    setChats((prev) => ({ ...prev, [seat.id]: [greeting(seat)] }))
  }

  return {
    selected: seats.find((s) => s.id === selectedId) ?? null,
    select,
    paused,
    togglePause,
    typing,
    busy,
    chats,
    tasks,
    send,
    clearChat,
  }
}

export type AgentWorkspaceState = ReturnType<typeof useAgentWorkspace>
