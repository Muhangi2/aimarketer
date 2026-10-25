"use client"

import { useState } from "react"
import { Clock, MessageSquare, MoreVertical, Pause, Play, Settings, Trash2, X } from "lucide-react"
import { cn } from "cn"
import type { OfficeSeat } from "@/lib/office-scene"
import type { AgentWorkspaceState } from "@/hooks/use-agent-workspace"
import { AgentAvatar } from "@/components/agents/agent-avatar"
import { AgentChat } from "@/components/agents/agent-chat"
import { AgentHistory } from "@/components/agents/agent-history"
import { AgentSettings } from "@/components/agents/agent-settings"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Tab = "chat" | "history" | "settings"

const TABS = [
  ["chat", "Chat", MessageSquare],
  ["history", "History", Clock],
  ["settings", "Settings", Settings],
] as const

/**
 * One agent's avatar, name and Chat / History / Settings tabs.
 * Render with key={seat.id} so each agent opens on the Chat tab.
 */
export function AgentPanel({
  seat,
  workspace,
  campaignId,
  userInitial,
  onClose,
  className,
}: {
  seat: OfficeSeat
  workspace: AgentWorkspaceState
  campaignId: string
  userInitial: string
  // Shows a close button when given
  onClose?: () => void
  className?: string
}) {
  const [tab, setTab] = useState<Tab>("chat")
  const isPaused = workspace.paused.has(seat.id)
  const taskCount = workspace.tasks[seat.id]?.length ?? 0

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-2xl border bg-card px-5 pt-5 pb-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300",
        className
      )}
    >
      <header className="flex shrink-0 flex-wrap items-start gap-4">
        <AgentAvatar seat={seat} className="size-14" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight">{seat.role.name}</h3>
            <span className="text-lg leading-none">{seat.role.emoji}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                isPaused
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400"
              )}
            >
              <span className={cn("size-1.5 rounded-full", isPaused ? "bg-amber-500" : "bg-emerald-500")} />
              {isPaused ? "Paused" : "Active"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{seat.role.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-9 rounded-xl" onClick={() => workspace.togglePause(seat.id)}>
            {isPaused ? <Play /> : <Pause />}
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button variant="outline" className="hidden h-9 rounded-xl sm:inline-flex" onClick={() => setTab("settings")}>
            <Settings /> Settings
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="size-9 rounded-xl" aria-label="More actions" />}
            >
              <MoreVertical />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 rounded-xl p-1.5">
              <DropdownMenuItem variant="destructive" className="rounded-lg p-2" onClick={() => workspace.clearChat(seat)}>
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
          {TABS.map(([value, label, Icon]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="h-10 flex-none rounded-none px-1 data-active:text-primary group-data-[variant=line]/tabs-list:after:bottom-[-1px] group-data-[variant=line]/tabs-list:after:bg-primary"
            >
              <Icon /> {label}
              {value === "history" && taskCount > 0 && (
                <span className="rounded-full bg-primary/12 px-1.5 text-[10px] font-semibold text-primary tabular-nums">
                  {taskCount}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="chat" className="flex min-h-0 flex-col">
          <AgentChat
            seat={seat}
            messages={workspace.chats[seat.id] ?? []}
            typing={workspace.typing.has(seat.id)}
            busy={workspace.busy.has(seat.id)}
            paused={isPaused}
            userInitial={userInitial}
            onSend={(text) => workspace.send(seat, text)}
          />
        </TabsContent>
        <TabsContent value="history" className="min-h-0 overflow-y-auto">
          <AgentHistory tasks={workspace.tasks[seat.id] ?? []} agentName={seat.role.name} />
        </TabsContent>
        <TabsContent value="settings" className="min-h-0 overflow-y-auto">
          <AgentSettings storageKey={`agent-settings:${campaignId}:${seat.id}`} agentName={seat.role.name} />
        </TabsContent>
      </Tabs>
    </section>
  )
}
