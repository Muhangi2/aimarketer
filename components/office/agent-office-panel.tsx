import { Bot } from "lucide-react"
import { cn } from "cn"
import type { OfficeScene } from "@/lib/office-scene"
import { AgentOffice } from "@/components/office/agent-office"

export function AgentOfficePanel({ scene, className }: { scene: OfficeScene; className?: string }) {
  return (
    <section className={cn("flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm", className)}>
      <header className="flex shrink-0 items-center gap-3 border-b px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/12 text-violet-600 dark:text-violet-400">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">AI Agent Office</h3>
          <p className="truncate text-xs text-muted-foreground">{scene.name}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          {scene.seats.length} {scene.seats.length === 1 ? "agent" : "agents"} working
        </span>
      </header>
      {/* Natural aspect ratio on small screens; fills the panel's height on large ones */}
      <AgentOffice scene={scene} className="lg:aspect-auto lg:min-h-0 lg:flex-1" />
    </section>
  )
}
