"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { MASTER_KEY, THREAD_KEYS, type AgentKey, type ThreadKey } from "@/lib/agent-roles"
import type { OfficeSeat } from "@/lib/office-scene"
import type {
  AgentMessage,
  AgentRequestRecord,
  AgentStates,
  AgentStatus,
  AgentTaskRecord,
  OrchestratorEvent,
  WorkspaceSnapshot,
} from "@/lib/agents/types"

let idCounter = 0
const localId = () => `local-${Date.now()}-${++idCounter}`

function toggled(set: ReadonlySet<ThreadKey>, key: ThreadKey, on: boolean) {
  const next = new Set(set)
  if (on) next.add(key)
  else next.delete(key)
  return next
}

function groupMessages(messages: AgentMessage[]) {
  const grouped = Object.fromEntries(THREAD_KEYS.map((k) => [k, [] as AgentMessage[]])) as Record<ThreadKey, AgentMessage[]>
  for (const m of messages) grouped[m.thread]?.push(m)
  return grouped
}

// Sends a request, refreshing the session once if the access token has expired
async function authedFetch(url: string, init: RequestInit) {
  let res = await fetch(url, init)
  if (res.status === 401) {
    const refreshed = await fetch("/api/auth/refresh", { method: "POST", signal: init.signal })
    if (refreshed.ok) res = await fetch(url, init)
  }
  return res
}

async function errorFrom(res: Response) {
  const { error } = await res.json().catch(() => ({ error: null }))
  return new Error(error ?? "Something went wrong.")
}

const json = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal,
})

/**
 * Chats, tasks and statuses for the Master Agent and the regular agents of one campaign.
 * Starts from the saved snapshot and stays in sync with the Master Agent's streamed progress.
 * Shared by the AI Agent page and the Overview page.
 */
export function useAgentWorkspace({
  seats,
  campaignId,
  initialSelection,
  snapshot,
}: {
  seats: OfficeSeat[]
  campaignId: string
  // "master" or a seat id (the ?agent= URL value)
  initialSelection: string | null
  snapshot: WorkspaceSnapshot
}) {
  const seatByKey = useMemo(() => new Map(seats.map((s) => [s.role.key, s] as const)), [seats])

  const [selectedKey, setSelectedKey] = useState<ThreadKey | null>(() => {
    if (initialSelection === MASTER_KEY) return MASTER_KEY
    return seats.find((s) => s.id === initialSelection)?.role.key ?? null
  })
  const [messages, setMessages] = useState(() => groupMessages(snapshot.messages))
  const [requests, setRequests] = useState<AgentRequestRecord[]>(snapshot.requests)
  const [tasks, setTasks] = useState<Record<string, AgentTaskRecord>>(() =>
    Object.fromEntries(snapshot.tasks.map((t) => [t.id, t]))
  )
  const [states, setStates] = useState<AgentStates>(snapshot.states)
  // Agents with a reply or task in progress
  const [typing, setTyping] = useState<ReadonlySet<ThreadKey>>(
    () => new Set(THREAD_KEYS.filter((k) => snapshot.states[k] === "working"))
  )
  // Chats waiting on a request the user sent
  const [busy, setBusy] = useState<ReadonlySet<ThreadKey>>(new Set())
  const requestsInFlight = useRef(new Map<ThreadKey, AbortController>())

  useEffect(() => {
    const pending = requestsInFlight.current
    return () => pending.forEach((c) => c.abort())
  }, [])

  // ---- Local state helpers ----

  function appendMessage(message: AgentMessage) {
    setMessages((prev) => ({ ...prev, [message.thread]: [...prev[message.thread], message] }))
  }

  function updateMessage(thread: ThreadKey, id: string, patch: Partial<AgentMessage>) {
    setMessages((prev) => ({ ...prev, [thread]: prev[thread].map((m) => (m.id === id ? { ...m, ...patch } : m)) }))
  }

  // A saved message replaces its optimistic copy, if there is one
  function receiveMessage(message: AgentMessage) {
    setMessages((prev) => {
      const thread = prev[message.thread]
      if (thread.some((m) => m.id === message.id)) return prev
      const optimistic = thread.findIndex((m) => m.local && !m.error && m.sender === message.sender && m.content === message.content)
      const next = optimistic === -1 ? [...thread, message] : thread.map((m, i) => (i === optimistic ? message : m))
      return { ...prev, [message.thread]: next }
    })
  }

  function setStatus(key: ThreadKey, status: AgentStatus) {
    setStates((prev) => ({ ...prev, [key]: status }))
    setTyping((prev) => toggled(prev, key, status === "working"))
  }

  function localError(thread: ThreadKey, text: string) {
    appendMessage({
      id: localId(),
      thread,
      sender: thread,
      recipient: "user",
      kind: "error",
      content: text,
      requestId: null,
      taskId: null,
      at: Date.now(),
      local: true,
      error: true,
    })
  }

  function applyEvent(event: OrchestratorEvent) {
    switch (event.type) {
      case "message":
        receiveMessage(event.message)
        break
      case "request":
        setRequests((prev) =>
          [event.request, ...prev.filter((r) => r.id !== event.request.id)].sort((a, b) => b.createdAt - a.createdAt)
        )
        break
      case "task":
        setTasks((prev) => ({ ...prev, [event.task.id]: event.task }))
        break
      case "agent":
        setStatus(event.agentKey, event.status)
        break
    }
  }

  // ---- Actions ----

  function select(key: ThreadKey | null) {
    setSelectedKey(key)
    // Keep the selection shareable without a server round trip
    const url = new URL(window.location.href)
    const value = key === MASTER_KEY ? MASTER_KEY : key ? seatByKey.get(key)?.id : null
    if (value) url.searchParams.set("agent", value)
    else url.searchParams.delete("agent")
    window.history.replaceState(null, "", url)
  }

  async function runMaster(body: { message: string } | { resume: true }) {
    if (requestsInFlight.current.has(MASTER_KEY)) return
    const controller = new AbortController()
    requestsInFlight.current.set(MASTER_KEY, controller)
    setBusy((prev) => toggled(prev, MASTER_KEY, true))
    setTyping((prev) => toggled(prev, MASTER_KEY, true))

    try {
      const res = await authedFetch("/api/agents/master/chat", json({ campaignId, ...body }, controller.signal))
      if (!res.ok || !res.body) throw await errorFrom(res)

      // Newline-delimited JSON events
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ""
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            applyEvent(JSON.parse(line) as OrchestratorEvent)
          } catch {
            // Ignore a malformed line rather than dropping the whole stream
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return
      localError(MASTER_KEY, `⚠️ ${error instanceof Error ? error.message : "Something went wrong."}`)
      // The optimistic message never reached the server
      if ("message" in body) {
        setMessages((prev) => ({
          ...prev,
          [MASTER_KEY]: prev[MASTER_KEY].map((m) => (m.local && m.content === body.message ? { ...m, error: true } : m)),
        }))
      }
    } finally {
      requestsInFlight.current.delete(MASTER_KEY)
      setBusy((prev) => toggled(prev, MASTER_KEY, false))
      setTyping((prev) => toggled(prev, MASTER_KEY, false))
    }
  }

  async function askAgent(key: AgentKey, text: string) {
    const controller = new AbortController()
    requestsInFlight.current.set(key, controller)
    setBusy((prev) => toggled(prev, key, true))
    setTyping((prev) => toggled(prev, key, true))

    const replyId = localId()
    let reply = ""
    try {
      const res = await authedFetch(`/api/agents/${key}/chat`, json({ campaignId, message: text }, controller.signal))
      if (!res.ok || !res.body) throw await errorFrom(res)

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!reply) {
          setTyping((prev) => toggled(prev, key, false))
          appendMessage({
            id: replyId,
            thread: key,
            sender: key,
            recipient: "user",
            kind: "chat",
            content: value,
            requestId: null,
            taskId: null,
            at: Date.now(),
            local: true,
          })
        } else {
          updateMessage(key, replyId, { content: reply + value })
        }
        reply += value
      }
      if (!reply.trim()) throw new Error("The agent didn't reply. Please try again.")
    } catch (error) {
      if (controller.signal.aborted) return
      const message = `⚠️ ${error instanceof Error ? error.message : "Something went wrong."}`
      if (reply) updateMessage(key, replyId, { content: `${reply}\n\n${message}` })
      else localError(key, message)
    } finally {
      requestsInFlight.current.delete(key)
      setBusy((prev) => toggled(prev, key, false))
      // Still working if the Master Agent has it on a task
      setTyping((prev) => toggled(prev, key, states[key] === "working"))
    }
  }

  function send(key: ThreadKey, text: string) {
    if (busy.has(key)) return
    appendMessage({
      id: localId(),
      thread: key,
      sender: "user",
      recipient: key,
      kind: "chat",
      content: text,
      requestId: null,
      taskId: null,
      at: Date.now(),
      local: true,
    })
    if (key === MASTER_KEY) void runMaster({ message: text })
    else void askAgent(key, text)
  }

  async function togglePause(key: AgentKey) {
    const wasPaused = states[key] === "paused"
    setStatus(key, wasPaused ? "idle" : "paused")
    try {
      const res = await authedFetch(`/api/agents/${key}/state`, json({ campaignId, paused: !wasPaused }))
      if (!res.ok) throw await errorFrom(res)
      const { resumable } = (await res.json()) as { resumable: boolean }
      // Work the Master Agent put on hold for this agent can continue now
      if (resumable) void runMaster({ resume: true })
    } catch (error) {
      setStatus(key, wasPaused ? "paused" : "idle")
      localError(key, `⚠️ ${error instanceof Error ? error.message : "Couldn't update the agent."}`)
    }
  }

  async function clearChat(key: ThreadKey) {
    requestsInFlight.current.get(key)?.abort()
    const previous = messages[key]
    setMessages((prev) => ({ ...prev, [key]: [] }))
    try {
      const res = await authedFetch(`/api/agents/${key}/messages`, { ...json({ campaignId }), method: "DELETE" })
      if (!res.ok) throw await errorFrom(res)
    } catch (error) {
      setMessages((prev) => ({ ...prev, [key]: previous }))
      localError(key, `⚠️ ${error instanceof Error ? error.message : "Couldn't clear the chat."}`)
    }
  }

  const taskList = useMemo(() => Object.values(tasks), [tasks])
  const pausedSeatIds = useMemo(
    () => new Set(seats.filter((s) => states[s.role.key] === "paused").map((s) => s.id)),
    [seats, states]
  )

  return {
    selectedKey,
    selectedSeat: selectedKey && selectedKey !== MASTER_KEY ? (seatByKey.get(selectedKey) ?? null) : null,
    seatFor: (key: AgentKey) => seatByKey.get(key) ?? null,
    select,
    messages,
    requests,
    tasks: taskList,
    states,
    pausedSeatIds,
    typing,
    busy,
    send,
    togglePause,
    clearChat,
  }
}

export type AgentWorkspaceState = ReturnType<typeof useAgentWorkspace>
