"use client"

import { useEffect, useRef } from "react"

/**
 * Soft brand-blue light on the landing grid that follows the cursor.
 * It is a little larger over the hero ([data-cursor="hero"]) and quieter elsewhere.
 * The position is written straight to CSS variables each frame, so React never re-renders.
 */
export function CursorField() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    // Only for real mice and trackpads
    if (!root || !window.matchMedia("(pointer: fine)").matches) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const target = { x: 0, y: 0 }
    const pos = { x: 0, y: 0 }
    let inHero = false
    let visible = false
    let frame = 0

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX
      target.y = e.clientY
      if (!visible) {
        // Start at the cursor instead of gliding in from a corner
        pos.x = target.x
        pos.y = target.y
        visible = true
        root.style.opacity = "1"
      }
      const hero = Boolean((e.target as Element | null)?.closest?.('[data-cursor="hero"]'))
      if (hero !== inHero) {
        inHero = hero
        root.dataset.mode = hero ? "hero" : "page"
      }
    }

    const onLeave = () => {
      visible = false
      root.style.opacity = "0"
    }

    const tick = () => {
      // Ease towards the cursor so the light trails slightly behind it
      const k = reduceMotion ? 1 : 0.15
      pos.x += (target.x - pos.x) * k
      pos.y += (target.y - pos.y) * k
      root.style.setProperty("--cx", `${pos.x}px`)
      root.style.setProperty("--cy", `${pos.y}px`)
      frame = requestAnimationFrame(tick)
    }

    window.addEventListener("pointermove", onMove, { passive: true })
    document.documentElement.addEventListener("pointerleave", onLeave)
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("pointermove", onMove)
      document.documentElement.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      aria-hidden
      data-mode="page"
      // Same layer as the backdrop (placed after it), so it sits under all content and cards
      className="cursor-field pointer-events-none fixed inset-0 -z-10 opacity-0 transition-opacity duration-500"
    >
      {/* Brighter copy of the grid, shown only inside a soft circle around the cursor */}
      <div className="cursor-grid absolute inset-0" />
    </div>
  )
}
