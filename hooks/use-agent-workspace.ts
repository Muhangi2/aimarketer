"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { MASTER_KEY, THREAD_KEYS, isComputerAgent, type AgentKey, type ComputerAgentKey, type ThreadKey } from "@/lib/agent-roles"
import type { OfficeSeat } from "@/lib/office-scene"
import { DISPATCH_WINDOW_MS } from "@/lib/agents/schedule"
import { liveStatus } from "@/lib/agents/live-status"
import {
  RUNNING_TASK_STATUSES,
  type AgentActivities,
  type AgentMessage,
  type AgentRequestRecord,
  type AgentStates,
  type AgentStatus,
  type AgentTaskRecord,
  type ArtifactRecord,
  type CampaignStatus,
  type ComputerRecord,
  type OrchestratorEvent,
  type TaskRunRecord,
  type WorkspaceSnapshot,
} from "@/lib/agents/types"

// Tasks run in the background (Inngest), so the workspace polls for their progress
const ACTIVE_POLL_MS = 10_000
const IDLE_POLL_MS = 60_000
// While an agent works on its computer, its activity ("Opening instagram.com") updates this often
const LIVE_POLL_MS = 4_000

export type ComputerAction = "take_over" | "hand_back" | "start" | "pause" | "heartbeat"

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
  const [runs, setRuns] = useState<TaskRunRecord[]>(snapshot.runs)
  const [states, setStates] = useState<AgentStates>(snapshot.states)
  const [activities, setActivities] = useState<AgentActivities>(snapshot.activities)
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>(snapshot.artifacts)
  const [computers, setComputers] = useState<ComputerRecord[]>(snapshot.computers)
  const [campaignStatus, setCampaignStatus] = useState<CampaignStatus>(snapshot.campaignStatus)
  // The computer open in the large viewer
  const [viewerKey, setViewerKey] = useState<ComputerAgentKey | null>(null)
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

  async function runMaster(body: { message: string }) {
    if (requestsInFlight.current.has(MASTER_KEY)) return
    const controller = new AbortController()
    requestsInFlight.current.set(MASTER_KEY, controller)
    setBusy((prev) => toggled(prev, MASTER_KEY, true))
    setTyping((prev) => toggled(prev, MASTER_KEY, true))

    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const res = await authedFetch("/api/agents/master/chat", json({ campaignId, timeZone, ...body }, controller.signal))
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
      setMessages((prev) => ({
        ...prev,
        [MASTER_KEY]: prev[MASTER_KEY].map((m) => (m.local && m.content === body.message ? { ...m, error: true } : m)),
      }))
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
      // Resuming dispatches the agent's overdue tasks; show them starting
      if (wasPaused) void refresh()
    } catch (error) {
      setStatus(key, wasPaused ? "paused" : "idle")
      localError(key, `⚠️ ${error instanceof Error ? error.message : "Couldn't update the agent."}`)
    }
  }

  function patchComputer(key: ComputerAgentKey, patch: Partial<ComputerRecord>) {
    setComputers((prev) => {
      const existing = prev.find((c) => c.agentKey === key)
      if (existing) return prev.map((c) => (c.agentKey === key ? { ...c, ...patch } : c))
      const blank: ComputerRecord = { agentKey: key, status: "none", control: "agent", currentTaskId: null, activity: null, lastActiveAt: Date.now(), screenshotAt: null, error: null }
      return [...prev, { ...blank, ...patch }]
    })
  }

  /** Take over / hand back, start / pause an agent's computer. Throws with a readable message. */
  async function computerAction(key: ComputerAgentKey, action: ComputerAction) {
    const res = await authedFetch(`/api/computers/${key}/control`, json({ campaignId, action }))
    if (!res.ok) throw await errorFrom(res)
    const { computer } = (await res.json()) as { computer: ComputerRecord | null }
    if (computer) patchComputer(key, computer)
    if (action !== "heartbeat") void refresh()
    return computer
  }

  /** Stops the campaign's plans and shuts its computers down for good. */
  async function endCampaign() {
    const res = await authedFetch("/api/campaigns/end", json({ campaignId }))
    if (!res.ok) throw await errorFrom(res)
    setCampaignStatus("ending")
    void refresh()
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

  // ---- Background progress ----

  const busyRef = useRef(busy)
  busyRef.current = busy

  /** Replaces state with the server's, keeping chats that are mid-request and local error notes. */
  async function refresh() {
    try {
      const res = await authedFetch(`/api/agents/workspace?campaignId=${campaignId}`, { method: "GET" })
      if (!res.ok) return
      const next = (await res.json()) as WorkspaceSnapshot
      const grouped = groupMessages(next.messages)
      setMessages((prev) =>
        Object.fromEntries(
          THREAD_KEYS.map((k) => [
            k,
            busyRef.current.has(k) ? prev[k] : [...grouped[k], ...prev[k].filter((m) => m.local && m.error)],
          ])
        ) as Record<ThreadKey, AgentMessage[]>
      )
      setRequests(next.requests)
      setTasks(Object.fromEntries(next.tasks.map((t) => [t.id, t])))
      setRuns(next.runs)
      setStates(next.states)
      setActivities(next.activities)
      setArtifacts(next.artifacts)
      setComputers(next.computers)
      setCampaignStatus(next.campaignStatus)
      setTyping((prev) => new Set(THREAD_KEYS.filter((k) => next.states[k] === "working" || (busyRef.current.has(k) && prev.has(k)))))
    } catch {
      // Try again on the next tick
    }
  }

  const taskValues = Object.values(tasks)
  const hasActiveWork =
    busy.size === 0 &&
    taskValues.some(
      (t) =>
        RUNNING_TASK_STATUSES.includes(t.status) || (t.status === "pending" && t.scheduledAt <= Date.now() + DISPATCH_WINDOW_MS)
    )
  const hasScheduledWork = taskValues.some((t) => t.status === "pending" || t.status === "waiting_for_user")
  const hasLiveComputer =
    campaignStatus === "ending" ||
    computers.some((c) => c.control === "user" || c.status === "starting" || c.status === "pausing") ||
    taskValues.some((t) => isComputerAgent(t.agentKey) && RUNNING_TASK_STATUSES.includes(t.status))

  useEffect(() => {
    if (busy.size > 0 || (!hasActiveWork && !hasScheduledWork && !hasLiveComputer)) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, hasLiveComputer ? LIVE_POLL_MS : hasActiveWork ? ACTIVE_POLL_MS : IDLE_POLL_MS)
    return () => window.clearInterval(timer)
    // refresh only reads refs and stable setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveWork, hasScheduledWork, hasLiveComputer, busy.size, campaignId])

  // Catch up when the user comes back to the tab
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && busyRef.current.size === 0) void refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId])

  const taskList = useMemo(() => Object.values(tasks), [tasks])
  const pausedSeatIds = useMemo(
    () => new Set(seats.filter((s) => states[s.role.key] === "paused").map((s) => s.id)),
    [seats, states]
  )

  const computerFor = (key: ComputerAgentKey) => computers.find((c) => c.agentKey === key) ?? null
  const statusFor = (key: AgentKey) =>
    liveStatus({
      agentKey: key,
      states,
      activities,
      tasks: taskList,
      computer: isComputerAgent(key) ? computerFor(key) : null,
      campaignStatus,
    })

  return {
    campaignId,
    selectedKey,
    selectedSeat: selectedKey && selectedKey !== MASTER_KEY ? (seatByKey.get(selectedKey) ?? null) : null,
    seatFor: (key: AgentKey) => seatByKey.get(key) ?? null,
    select,
    messages,
    requests,
    tasks: taskList,
    runs,
    states,
    pausedSeatIds,
    typing,
    busy,
    send,
    togglePause,
    clearChat,
    activities,
    artifacts,
    computers,
    computerFor,
    statusFor,
    campaignStatus,
    computerAction,
    endCampaign,
    refresh,
    viewerKey,
    openViewer: (key: ComputerAgentKey) => setViewerKey(key),
    closeViewer: () => setViewerKey(null),
  }
}

export type AgentWorkspaceState = ReturnType<typeof useAgentWorkspace>
