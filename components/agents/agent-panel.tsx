"use client"

import { useState } from "react"
import { Clock, LayoutGrid, MessageSquare, Monitor, MoreVertical, Pause, Play, Settings, Trash2, Workflow, X } from "lucide-react"
import { cn } from "cn"
import { AGENT_ROLES, COMPUTER_AGENT_KEYS, MASTER_KEY, MASTER_ROLE, isComputerAgent, type ComputerAgentKey, type ThreadKey } from "@/lib/agent-roles"
import { ACTIVE_TASK_STATUSES } from "@/lib/agents/types"
import type { AgentWorkspaceState } from "@/hooks/use-agent-workspace"
import { AgentChat } from "@/components/agents/agent-chat"
import { AgentHistory } from "@/components/agents/agent-history"
import { AgentSettings } from "@/components/agents/agent-settings"
import { MasterTasks } from "@/components/agents/master-tasks"
import { AgentStatusBadge, ParticipantAvatar } from "@/components/agents/participant-avatar"
import { LiveActivity, LiveStatusBadge } from "@/components/agents/live-status-badge"
import { ComputerCard } from "@/components/computers/computer-card"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Tab = "chat" | "history" | "computer" | "settings"

/**
 * One agent's header and tabs. The Master Agent gets Chat / Tasks (the plan tracker);
 * regular agents get Chat / History / Settings. Render with key={agentKey} so each opens on Chat.
 */
export function AgentPanel({
  agentKey,
  workspace,
  campaignId,
  userInitial,
  onClose,
  className,
}: {
  agentKey: ThreadKey
  workspace: AgentWorkspaceState
  campaignId: string
  userInitial: string
  // Shows a close button when given
  onClose?: () => void
  className?: string
}) {
  const [tab, setTab] = useState<Tab>("chat")
  const isMaster = agentKey === MASTER_KEY
  const role = isMaster ? MASTER_ROLE : AGENT_ROLES.find((r) => r.key === agentKey)!
  const status = workspace.states[agentKey]
  const isPaused = status === "paused"

  const tasks = isMaster ? workspace.tasks : workspace.tasks.filter((t) => t.agentKey === agentKey)
  const badgeCount = isMaster
    ? workspace.requests.filter((r) => ["running", "awaiting_clarification", "waiting", "planning"].includes(r.status)).length
    : tasks.filter((t) => ACTIVE_TASK_STATUSES.includes(t.status)).length

  const hasComputer = isComputerAgent(agentKey)
  const live = isMaster ? null : workspace.statusFor(agentKey)
  const ended = workspace.campaignStatus !== "active"
  // "Login now": the user takes control of the agent's computer in the large viewer
  const openComputer = (key: ComputerAgentKey) => {
    workspace.openViewer(key)
    void workspace.computerAction(key, "take_over").catch(() => undefined)
  }
  const waitingCount = workspace.tasks.filter((t) => t.status === "waiting_for_user" && (isMaster || t.agentKey === agentKey)).length

  const tabs = [
    ["chat", "Chat", MessageSquare],
    ["history", isMaster ? "Tasks" : "History", isMaster ? Workflow : Clock],
    ...(isMaster ? ([["computer", "Computers", LayoutGrid]] as const) : hasComputer ? ([["computer", "Computer", Monitor]] as const) : []),
    ...(isMaster ? [] : ([["settings", "Settings", Settings]] as const)),
  ] as const

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-2xl border bg-card px-5 pt-5 pb-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300",
        isMaster && "border-violet-500/30 shadow-violet-500/10 ring-1 ring-violet-500/15",
        className
      )}
    >
      <header className="flex shrink-0 flex-wrap items-start gap-4">
        <ParticipantAvatar who={agentKey} seatFor={workspace.seatFor} userInitial={userInitial} className="size-14" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight">{role.name}</h3>
            <span className="text-lg leading-none">{role.emoji}</span>
            {live ? <LiveStatusBadge status={live} className="px-2 text-[11px]" /> : <AgentStatusBadge status={status} className="px-2 text-[11px]" />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
          {live && <LiveActivity status={live} className="mt-1 text-xs text-foreground/80" />}
        </div>
        <div className="flex items-center gap-2">
          {!isMaster && (
            <>
              <Button variant="outline" className="h-9 rounded-xl" onClick={() => workspace.togglePause(role.key as Exclude<ThreadKey, "master">)}>
                {isPaused ? <Play /> : <Pause />}
                {isPaused ? "Resume" : "Pause"}
              </Button>
              <Button variant="outline" className="hidden h-9 rounded-xl sm:inline-flex" onClick={() => setTab("settings")}>
                <Settings /> Settings
              </Button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="size-9 rounded-xl" aria-label="More actions" />}
            >
              <MoreVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-xl p-1.5">
              <DropdownMenuItem variant="destructive" className="rounded-lg p-2" onClick={() => workspace.clearChat(agentKey)}>
                <Trash2 /> Clear chat
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {onClose && (
            <Button variant="ghost" size="icon" className="size-9 rounded-xl" onClick={onClose} aria-label="Close agent">
              <X />
            </Button>
          )}
        </div>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-4 flex min-h-0 flex-1 flex-col gap-0">
        <TabsList variant="line" className="h-auto w-full shrink-0 justify-start gap-4 border-b p-0">
          {tabs.map(([value, label, Icon]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-10 flex-none rounded-none px-1 data-active:text-primary group-data-[variant=line]/tabs-list:after:bottom-[-1px] group-data-[variant=line]/tabs-list:after:bg-primary"
            >
              <Icon /> {label}
              {value === "history" && badgeCount > 0 && (
                <span className="rounded-full bg-primary/12 px-1.5 text-[10px] font-semibold text-primary tabular-nums">
                  {badgeCount}
                </span>
              )}
              {value === "computer" && waitingCount > 0 && (
                <span className="size-2 animate-pulse rounded-full bg-amber-500" aria-label="Waiting for you" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="chat" className="flex min-h-0 flex-col">
          <AgentChat
            owner={agentKey}
            greeting={role.greeting}
            messages={workspace.messages[agentKey]}
            typing={workspace.typing.has(agentKey)}
            busy={workspace.busy.has(agentKey)}
            paused={isPaused}
            disabled={isMaster && ended}
            placeholder={
              isMaster && ended
                ? "This campaign has ended"
                : isMaster
                  ? "Tell the Master Agent what the team should work on…"
                  : `Ask the ${role.name} a question…`
            }
            tasks={workspace.tasks}
            artifacts={workspace.artifacts}
            onHelp={openComputer}
            userInitial={userInitial}
            seatFor={workspace.seatFor}
            onSend={(text) => workspace.send(agentKey, text)}
          />
        </TabsContent>
        <TabsContent value="history" className="min-h-0 overflow-y-auto">
          {isMaster ? (
            <MasterTasks
              requests={workspace.requests}
              tasks={workspace.tasks}
              runs={workspace.runs}
              artifacts={workspace.artifacts}
              seatFor={workspace.seatFor}
              onHelp={openComputer}
            />
          ) : (
            <AgentHistory
              tasks={tasks}
              runs={workspace.runs}
              artifacts={workspace.artifacts}
              agentName={role.name}
              onHelp={hasComputer ? () => openComputer(agentKey as ComputerAgentKey) : undefined}
            />
          )}
        </TabsContent>
        {(isMaster || hasComputer) && (
          <TabsContent value="computer" className="min-h-0 overflow-y-auto">
            {isMaster ? (
              <div className="grid gap-5 py-4 animate-in fade-in duration-300 sm:grid-cols-2">
                {COMPUTER_AGENT_KEYS.map((key) => (
                  <ComputerCard key={key} workspace={workspace} agentKey={key} compact className="rounded-2xl border bg-muted/20 p-3" />
                ))}
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  The Research and Creator agents each have their own cloud computer. Idle computers pause after 3 minutes and resume for the next task.
                </p>
              </div>
            ) : (
              <ComputerCard workspace={workspace} agentKey={agentKey as ComputerAgentKey} className="py-4 animate-in fade-in duration-300" />
            )}
          </TabsContent>
        )}
        {!isMaster && (
          <TabsContent value="settings" className="min-h-0 overflow-y-auto">
            <AgentSettings storageKey={`agent-settings:${campaignId}:${workspace.seatFor(role.key as Exclude<ThreadKey, "master">)?.id ?? agentKey}`} agentName={role.name} />
          </TabsContent>
        )}
      </Tabs>
    </section>
  )
}
