"use client"

import { useEffect, useState } from "react"
import { cn } from "cn"
import type { OfficeScene } from "@/lib/office-scene"

// Matches the frame rate used by the AgentWorld Studio editor
const FRAME_MS = 260

function useFrameTick(enabled: boolean) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    let timer: number | undefined

    const start = () => {
      if (timer === undefined && !motion.matches && document.visibilityState === "visible") {
        timer = window.setInterval(() => setTick((t) => t + 1), FRAME_MS)
      }
    }
    const stop = () => {
      window.clearInterval(timer)
      timer = undefined
    }
    const sync = () => {
      stop()
      start()
    }

    start()
    document.addEventListener("visibilitychange", sync)
    motion.addEventListener("change", sync)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", sync)
      motion.removeEventListener("change", sync)
    }
  }, [enabled])

  return tick
}

/**
 * Renders an AgentWorld office scene. Everything is drawn in the scene's own coordinate
 * space, so the office scales with its container and agents keep their exact positions.
 */
export function AgentOffice({ scene, className }: { scene: OfficeScene; className?: string }) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const loaded = loadedSrc === scene.background
  const tick = useFrameTick(scene.seats.some((s) => s.frames.length > 1))
  const { viewBox } = scene

  // Fade the scene in once the (large) background has downloaded
  useEffect(() => {
    const img = new Image()
    const done = () => setLoadedSrc(scene.background)
    img.onload = done
    img.onerror = done
    img.src = scene.background
    if (img.complete) done()
  }, [scene.background])

  return (
    <div
      className={cn("relative aspect-(--office-aspect) w-full overflow-hidden bg-muted", className)}
      style={{ "--office-aspect": `${viewBox.width} / ${viewBox.height}` } as React.CSSProperties}
    >
      {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" />}
      {/* "slice" covers containers of any shape; background and agents crop together, so seats stay put */}
      <svg
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        preserveAspectRatio="xMidYMid slice"
        className={cn("absolute inset-0 size-full transition-opacity duration-700", loaded ? "opacity-100" : "opacity-0")}
        role="img"
        aria-label={`${scene.name} with ${scene.seats.length} AI agents at work`}
      >
        <image href={scene.background} x={0} y={0} width={scene.width} height={scene.height} />
        {scene.seats.map((seat) => (
          <g key={seat.id}>
            <title>{`${seat.agentName} · ${seat.label}`}</title>
            {/* All frames stay mounted so switching frames never waits on a network request */}
            {seat.frames.map((frame, i) => (
              <image
                key={frame}
                href={frame}
                x={seat.x}
                y={seat.y}
                width={seat.width}
                height={seat.height}
                visibility={i === tick % seat.frames.length ? "visible" : "hidden"}
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
}
