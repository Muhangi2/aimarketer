"use client"

import { useEffect, useRef, useState } from "react"
import NumberFlow from "@number-flow/react"
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react"
import { cn } from "cn"
import { ease, unsplash } from "./shared"

// Live demos of each agent at work, drawn on the grey "How it works" panel

function useTicker(ms: number) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: "-10%" })
  const reduceMotion = useReducedMotion()
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!inView || reduceMotion) return
    const timer = setInterval(() => setStep((s) => s + 1), ms)
    return () => clearInterval(timer)
  }, [inView, reduceMotion, ms])

  return [ref, step, inView] as const
}

const TRENDS = [
  { topic: "#SlowMorningRoutine", lift: 182 },
  { topic: "Behind-the-scenes reels", lift: 146 },
  { topic: "Founder story carousels", lift: 97 },
  { topic: "Home brewing guides", lift: 71 },
  { topic: "Day-in-the-life vlogs", lift: 54 },
]

export function ResearchVisual() {
  const [ref, step] = useTicker(2000)
  const offset = step % TRENDS.length
  const rows = [...TRENDS.slice(offset), ...TRENDS.slice(0, offset)].slice(0, 4)

  return (
    <div ref={ref} className="w-full max-w-[380px]">
      <div className="mb-4 flex items-center justify-between font-mono text-[11px] text-ink/55 uppercase">
        <span>Rising in your niche</span>
        <span className="flex items-center gap-1.5 text-brand-deep">
          <span className="size-1.5 animate-pulse rounded-full bg-brand-glow" />
          scanning
        </span>
      </div>
      <ul className="space-y-2">
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map((row, i) => (
            <motion.li
              key={row.topic}
              layout
              initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
              animate={{ opacity: 1 - i * 0.2, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -18, filter: "blur(6px)" }}
              transition={{ duration: 0.6, ease }}
              className={cn(
                "flex items-center justify-between rounded-2xl border px-4 py-3.5",
                i === 0 ? "border-brand/50 bg-brand/15" : "border-black/12 bg-black/[0.03]"
              )}
            >
              <span className="flex items-center gap-3 text-sm text-ink/75">
                <span className="font-mono text-[11px] text-ink/55">0{i + 1}</span>
                {row.topic}
              </span>
              <span className="font-mono text-xs text-brand-deep">
                +<NumberFlow value={row.lift} />%
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}

const CAPTIONS = [
  "Slow mornings, small batches, big flavour. Our new single-origin is here ☕️",
  "3 things we learned roasting 10,000 bags this year (number 2 surprised us)",
  "POV: you finally found a coffee that tastes as good as it smells",
]

export function CreatorVisual() {
  const [ref, step, inView] = useTicker(4400)
  const caption = CAPTIONS[step % CAPTIONS.length]
  const [typed, setTyped] = useState(0)

  useEffect(() => {
    if (!inView) return
    setTyped(0)
    const timer = setInterval(() => setTyped((t) => (t >= caption.length ? t : t + 1)), 26)
    return () => clearInterval(timer)
  }, [caption, inView])

  return (
    <div ref={ref} className="relative w-full max-w-[320px]">
      <div className="absolute -top-4 -right-6 rotate-6 rounded-xl border border-black/12 bg-black/[0.06] px-3 py-2 font-mono text-[10px] text-ink/75 backdrop-blur">
        tone: warm · playful
      </div>
      <div className="rounded-[22px] bg-white p-3 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,0.18)]">
        <div className="flex items-center gap-2">
          <span className="size-7 rounded-full bg-linear-to-br from-brand-glow to-brand" />
          <span className="text-xs font-semibold">brewline.coffee</span>
          <span className="ml-auto rounded-full bg-brand-wash px-2 py-0.5 font-mono text-[10px] text-brand">draft</span>
        </div>
        <div className="mt-3 aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={unsplash("1509042239860-f550ce710b93", 640)} alt="" className="size-full object-cover" />
        </div>
        <p className="mt-3 min-h-[3.75rem] text-[13px] leading-snug text-slate-700">
          {caption.slice(0, typed)}
          <span className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-brand" />
        </p>
      </div>
    </div>
  )
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const SLOTS = [
  { day: 0, row: 0, label: "Reel" },
  { day: 1, row: 1, label: "Carousel" },
  { day: 2, row: 0, label: "Short" },
  { day: 3, row: 2, label: "Story" },
  { day: 4, row: 1, label: "Reel" },
  { day: 5, row: 0, label: "Post" },
  { day: 6, row: 2, label: "Live" },
]

export function SchedulerVisual() {
  const [ref, step] = useTicker(600)
  const filled = step % (SLOTS.length + 5)

  return (
    <div ref={ref} className="w-full max-w-[420px]">
      <div className="mb-4 flex items-center justify-between font-mono text-[11px] text-ink/55 uppercase">
        <span>Next week</span>
        <span>
          <NumberFlow value={Math.min(filled, SLOTS.length)} /> / {SLOTS.length} booked
        </span>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {DAYS.map((day, d) => (
          <div key={day} className="flex flex-col gap-2">
            <span className="text-center font-mono text-[10px] text-ink/55">{day}</span>
            {[0, 1, 2].map((row) => {
              const index = SLOTS.findIndex((s) => s.day === d && s.row === row)
              const slot = index >= 0 ? SLOTS[index] : null
              return (
                <div key={row} className="relative h-14 rounded-xl border border-black/[0.08] bg-black/[0.03]">
                  <AnimatePresence>
                    {slot && index < filled && (
                      <motion.div
                        initial={{ opacity: 0, y: -36, scale: 0.6 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ type: "spring", stiffness: 380, damping: 22 }}
                        className={cn(
                          "absolute inset-1 flex items-end rounded-lg p-1.5",
                          row === 0 ? "bg-brand" : row === 1 ? "bg-brand-bright/80" : "bg-brand-glow/70"
                        )}
                      >
                        <span className="truncate text-[9px] font-semibold text-white">{slot.label}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

const WEEKS = [
  [32, 41, 38, 52, 47, 63, 71],
  [28, 36, 49, 44, 58, 66, 82],
  [35, 30, 46, 57, 61, 74, 88],
]

export function AnalyticsVisual() {
  const [ref, step] = useTicker(2400)
  const bars = WEEKS[step % WEEKS.length]
  const growth = Math.round(((bars[6] - bars[5]) / bars[5]) * 100)

  return (
    <div ref={ref} className="w-full max-w-[380px] rounded-[22px] border border-black/12 bg-black/[0.04] p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-wider text-ink/55 uppercase">Engagement, last 7 days</p>
          <p className="mt-1 text-4xl font-medium tracking-tight">
            +<NumberFlow value={growth} />%
          </p>
        </div>
        <span className="rounded-full bg-brand/20 px-2 py-0.5 font-mono text-[10px] text-brand-deep">vs yesterday</span>
      </div>
      <div className="mt-6 flex h-32 items-end gap-2">
        {bars.map((h, i) => (
          <motion.div
            key={i}
            animate={{ height: `${h}%` }}
            transition={{ type: "spring", stiffness: 160, damping: 20, delay: i * 0.04 }}
            className={cn(
              "flex-1 rounded-t-lg",
              i === bars.length - 1 ? "bg-linear-to-t from-brand to-brand-glow" : "bg-black/10"
            )}
          />
        ))}
      </div>
      <p className="mt-4 rounded-xl bg-black/[0.05] px-3 py-2.5 text-xs text-ink/75">
        Reels posted at 6 PM get twice the saves. Next week leans into reels.
      </p>
    </div>
  )
}
