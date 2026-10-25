"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "cn"
import type { OfficeScene, OfficeSeat } from "@/lib/office-scene"

// Matches the frame rate used by the AgentWorld Studio editor
const FRAME_MS = 260
// Name tags point at this fraction of the way down the character sprite (just above the head)
const TAG_ANCHOR_INSET = 0.1
// Keep tags this many pixels (roughly half a tag's width) away from the left and right edges
const TAG_EDGE_PADDING = 76

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

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}

/**
 * Renders an AgentWorld office scene. Everything is drawn in the scene's own coordinate
 * space, so the office scales with its container and agents keep their exact positions.
 */
export function AgentOffice({ scene, className }: { scene: OfficeScene; className?: string }) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const loaded = loadedSrc === scene.background
  const tick = useFrameTick(scene.seats.some((s) => s.frames.length > 1))
  const [containerRef, size] = useElementSize<HTMLDivElement>()
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

  // Same mapping as preserveAspectRatio="xMidYMid slice": scene units -> container pixels
  const toScreen = (x: number, y: number) => {
    if (!size) return null
    const scale = Math.max(size.width / viewBox.width, size.height / viewBox.height)
    const offsetX = (size.width - viewBox.width * scale) / 2
    const offsetY = (size.height - viewBox.height * scale) / 2
    return { left: (x - viewBox.x) * scale + offsetX, top: (y - viewBox.y) * scale + offsetY }
  }

  return (
    <div
      ref={containerRef}
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

      {loaded &&
        scene.seats.map((seat, i) => {
          const point = toScreen(seat.x + seat.width / 2, seat.y + seat.height * TAG_ANCHOR_INSET)
          // Hide tags for agents cropped out of view
          if (!point || !size || point.left < 0 || point.left > size.width || point.top < 24 || point.top > size.height) {
            return null
          }
          const left = Math.min(Math.max(point.left, TAG_EDGE_PADDING), size.width - TAG_EDGE_PADDING)
          return (
            <AgentTag key={seat.id} seat={seat} index={i} left={left} top={point.top} pointerShift={point.left - left} />
          )
        })}
    </div>
  )
}

function AgentTag({
  seat,
  index,
  left,
  top,
  pointerShift,
}: {
  seat: OfficeSeat
  index: number
  left: number
  top: number
  // Horizontal offset from the tag's centre to the agent when the tag was nudged off an edge
  pointerShift: number
}) {
  const { role } = seat

  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-full animate-in fade-in zoom-in-90 fill-mode-both duration-500"
      style={{ left, top, animationDelay: `${150 + index * 120}ms` }}
    >
      <div className="animate-agent-float motion-reduce:animate-none" style={{ animationDelay: `${index * -0.8}s` }}>
        <button
          type="button"
          aria-label={`${role.name}: ${role.task}`}
          className="group/tag relative flex items-center gap-1.5 rounded-full border border-white/70 bg-white/90 py-1 pr-2.5 pl-1 text-left shadow-lg shadow-black/15 backdrop-blur-md transition-all duration-300 outline-none hover:scale-105 hover:pr-3 focus-visible:ring-3 focus-visible:ring-primary/40 dark:border-white/10 dark:bg-slate-900/85"
        >
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] leading-none", role.tone)}>
            {role.emoji}
          </span>
          <span className="grid leading-tight">
            <span className="flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap text-slate-900 dark:text-white">
              {role.name}
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
            </span>
            {/* Current task slides open on hover / focus */}
            <span className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 group-hover/tag:grid-rows-[1fr] group-focus-visible/tag:grid-rows-[1fr]">
              <span className="overflow-hidden text-[10px] whitespace-nowrap text-slate-500 dark:text-slate-300">
                {role.task}…
              </span>
            </span>
          </span>
          {/* Pointer down towards the agent */}
          <span
            aria-hidden
            className="absolute -bottom-1 size-2 -translate-x-1/2 rotate-45 border-r border-b border-white/70 bg-white/90 dark:border-white/10 dark:bg-slate-900/85"
            style={{ left: `calc(50% + ${pointerShift}px)` }}
          />
        </button>
      </div>
    </div>
  )
}
