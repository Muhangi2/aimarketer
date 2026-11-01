"use client"

import { useEffect, useState } from "react"
import { Monitor, MonitorPause, MonitorX } from "lucide-react"
import { cn } from "cn"
import type { ComputerAgentKey } from "@/lib/agent-roles"
import type { ComputerRecord } from "@/lib/agents/types"

// How often a running computer's preview refreshes
const LIVE_REFRESH_MS = 3000

/**
 * The agent's screen, as images from our server (never the stream itself): refreshed every few
 * seconds while the desktop runs, the saved screenshot while it's paused.
 */
export function ComputerScreen({
  campaignId,
  agentKey,
  computer,
  className,
}: {
  campaignId: string
  agentKey: ComputerAgentKey
  computer: ComputerRecord | null
  className?: string
}) {
  const running = computer?.status === "running"
  const hasSaved = Boolean(computer?.screenshotAt)
  const [tick, setTick] = useState(0)
  // The image shown; the next one is swapped in only once it has loaded, so the preview never flickers
  const [shown, setShown] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setTick((t) => t + 1)
    }, LIVE_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [running])

  const version = running ? `live-${tick}` : `saved-${computer?.screenshotAt ?? 0}`
  const wanted = running || hasSaved ? `/api/computers/${agentKey}/screen?campaignId=${campaignId}&v=${version}` : null

  useEffect(() => {
    if (!wanted) {
      setShown(null)
      return
    }
    const img = new Image()
    img.onload = () => {
      setShown(wanted)
      setFailed(false)
    }
    img.onerror = () => setFailed(true)
    img.src = wanted
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [wanted])

  const placeholder = (() => {
    if (!computer || computer.status === "none") return { Icon: Monitor, text: "The computer starts with the agent's next task" }
    if (computer.status === "starting") return { Icon: Monitor, text: "Starting the computer…" }
    if (computer.status === "shut_down") return { Icon: MonitorX, text: "Shut down" }
    if (computer.status === "error") return { Icon: MonitorX, text: computer.error ?? "The computer had a problem" }
    if (!running && !hasSaved) return { Icon: MonitorPause, text: "Paused" }
    if (failed && !shown) return { Icon: MonitorX, text: "Couldn't load the screen" }
    return null
  })()

  return (
    <div className={cn("relative aspect-[4/3] w-full overflow-hidden rounded-xl border bg-slate-950", className)}>
      {shown && !placeholder ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown} alt="The agent's screen" className={cn("size-full object-contain", !running && "opacity-70 grayscale-[35%]")} draggable={false} />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 px-4 text-center text-slate-400">
          {placeholder ? <placeholder.Icon className="size-7" /> : <Monitor className="size-7 animate-pulse" />}
          <p className="text-xs">{placeholder?.text ?? "Loading the screen…"}</p>
        </div>
      )}
      {computer?.status === "paused" && shown && (
        <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">Paused</span>
      )}
      {running && shown && (
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
          <span className="size-1.5 animate-pulse rounded-full bg-red-500" /> Live
        </span>
      )}
    </div>
  )
}
