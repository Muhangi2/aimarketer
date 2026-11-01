"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "cn"
import type { OfficeScene, OfficeSeat } from "@/lib/office-scene"
import { LIVE_STATUS_STYLE, type LiveStatus } from "@/lib/agents/live-status"

// Matches the frame rate used by the AgentWorld Studio editor
const FRAME_MS = 260
// Name tags point at this fraction of the way down the character sprite (just above the head)
const TAG_ANCHOR_INSET = 0.1
// Keep tag centres this many pixels from the left and right edges (about half a selected tag's width)
const TAG_EDGE_PADDING = 100

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
export function AgentOffice({
  scene,
  className,
  selectedSeatId,
  onSelectSeat,
  pausedSeatIds,
  seatStatus,
}: {
  scene: OfficeScene
  className?: string
  // When onSelectSeat is given, characters and tags become clickable
  selectedSeatId?: string | null
  onSelectSeat?: (seatId: string) => void
  pausedSeatIds?: ReadonlySet<string>
  seatStatus?: (seat: OfficeSeat) => LiveStatus
}) {
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
          <g
            key={seat.id}
            onClick={onSelectSeat ? () => onSelectSeat(seat.id) : undefined}
            className={cn(
              "transition-[filter] duration-300",
              onSelectSeat && "cursor-pointer hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.9)]",
              seat.id === selectedSeatId && "drop-shadow-[0_0_14px_rgba(37,99,235,0.95)] hover:drop-shadow-[0_0_14px_rgba(37,99,235,0.95)]"
            )}
          >
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
            <AgentTag
              key={seat.id}
              seat={seat}
              index={i}
              left={left}
              top={point.top}
              pointerShift={point.left - left}
              selected={seat.id === selectedSeatId}
              paused={pausedSeatIds?.has(seat.id) ?? false}
              live={seatStatus?.(seat)}
              onSelect={onSelectSeat ? () => onSelectSeat(seat.id) : undefined}
            />
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
  selected,
  paused,
  live,
  onSelect,
}: {
  seat: OfficeSeat
  index: number
  left: number
  top: number
  // Horizontal offset from the tag's centre to the agent when the tag was nudged off an edge
  pointerShift: number
  selected: boolean
  paused: boolean
  live?: LiveStatus
  onSelect?: () => void
}) {
  const { role } = seat
  // What the agent is doing right now; the role's usual task when there's no live status
  const caption = live ? (live.activity ? `${live.label} · ${live.activity}` : live.label) : paused ? "Paused" : `${role.task}…`
  const dot = live ? LIVE_STATUS_STYLE[live.key].dot : paused ? "bg-amber-400" : "bg-emerald-400"
  // Agents that are working or need the user show their activity without hovering
  const showCaption = selected || live?.key === "running" || live?.key === "waiting" || live?.key === "in_control"

  return (
    <div
      className={cn(
        "absolute -translate-x-1/2 -translate-y-full animate-in fade-in zoom-in-90 fill-mode-both duration-500",
        selected ? "z-20" : "z-10"
      )}
      style={{ left, top, animationDelay: `${150 + index * 120}ms` }}
    >
      <div className="animate-agent-float motion-reduce:animate-none" style={{ animationDelay: `${index * -0.8}s` }}>
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={onSelect ? selected : undefined}
          aria-label={`${role.name}: ${caption}`}
          className={cn(
            "group/tag relative flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-left shadow-lg backdrop-blur-md transition-all duration-300 outline-none hover:scale-105 hover:pr-3 focus-visible:ring-3 focus-visible:ring-primary/40",
            selected
              ? "scale-105 border-blue-400/60 bg-primary pr-3 text-primary-foreground shadow-primary/40"
              : "border-white/70 bg-white/90 shadow-black/15 dark:border-white/10 dark:bg-slate-900/85",
            !onSelect && "cursor-default"
          )}
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] leading-none",
              selected ? "bg-white" : role.tone
            )}
          >
            {role.emoji}
          </span>
          <span className="grid leading-tight">
            <span
              className={cn(
                "flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap",
                selected ? "text-white" : "text-slate-900 dark:text-white"
              )}
            >
              {role.name}
              <span className={cn("size-1.5 rounded-full", dot)} aria-hidden />
            </span>
            {/* Current task: always shown for the selected agent, otherwise slides open on hover / focus */}
            <span
              className={cn(
                "grid transition-[grid-template-rows] duration-300 group-hover/tag:grid-rows-[1fr] group-focus-visible/tag:grid-rows-[1fr]",
                showCaption ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <span
                className={cn(
                  "max-w-48 overflow-hidden text-[10px] text-ellipsis whitespace-nowrap",
                  selected ? "text-blue-100" : "text-slate-500 dark:text-slate-300"
                )}
              >
                {caption}
              </span>
            </span>
          </span>
          {/* Pointer down towards the agent */}
          <span
            aria-hidden
            className={cn(
              "absolute -bottom-1 size-2 -translate-x-1/2 rotate-45 border-r border-b transition-colors duration-300",
              selected
                ? "border-blue-400/60 bg-primary"
                : "border-white/70 bg-white/90 dark:border-white/10 dark:bg-slate-900/85"
            )}
            style={{ left: `calc(50% + ${pointerShift}px)` }}
          />
        </button>
      </div>
    </div>
  )
}
