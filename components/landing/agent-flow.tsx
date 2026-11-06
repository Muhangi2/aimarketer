"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useInView, useReducedMotion } from "motion/react"
import { CalendarClock, Heart, TrendingUp } from "lucide-react"
import { cn } from "cn"
import { AGENTS, MASTER_AGENT, SectionHeading, ease, unsplash } from "./shared"

// Diagram coordinates (the HTML nodes and the SVG share this space)
const W = 1200
const H = 540
const GOAL = { x: 130, y: 270 }
const MASTER = { x: 420, y: 270 }
const AGENT_X = 700
const OUTPUT_X = 1010
const ROWS = [78, 206, 334, 462]

const pct = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` })

const GOAL_TEXT = "Grow Brewline to 10k followers by March"

function curve(from: { x: number; y: number }, to: { x: number; y: number }) {
  const mid = (from.x + to.x) / 2
  return `M${from.x} ${from.y} C${mid} ${from.y} ${mid} ${to.y} ${to.x} ${to.y}`
}

export function AgentFlow() {
  return (
    <section id="product" data-nav-theme="light" className="relative scroll-mt-24 overflow-hidden bg-transparent px-5 py-28 text-ink sm:px-8 sm:py-36">
      <div className="relative mx-auto max-w-7xl">
        <SectionHeading
          center
          eyebrow="One goal in"
          title={
            <>
              A month of content out.{" "}
              <span className="text-muted-foreground/80">Without lifting a finger.</span>
            </>
          }
          body="Tell the Master Agent what you want to achieve. It breaks the goal into tasks, hands them to four specialists and keeps the whole campaign moving."
        />
        <div className="mt-20 hidden lg:block">
          <FlowDiagram />
        </div>
        <FlowList />
      </div>
    </section>
  )
}

function FlowDiagram() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-120px" })
  const reduceMotion = useReducedMotion()

  const masterPaths = ROWS.map((y) => curve({ x: MASTER.x + 60, y: MASTER.y }, { x: AGENT_X - 110, y }))
  const outputPaths = ROWS.map((y) => `M${AGENT_X + 110} ${y} L${OUTPUT_X - 120} ${y}`)
  const goalPath = `M${GOAL.x + 130} ${GOAL.y} L${MASTER.x - 60} ${MASTER.y}`
  const allPaths = [goalPath, ...masterPaths, ...outputPaths]

  return (
    <div ref={ref} className="relative mx-auto aspect-[1200/540] w-full max-w-6xl">
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id="flow-line" x1="0" x2="1">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#2563eb" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#2563eb" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        {allPaths.map((d, i) => (
          <motion.path
            key={d}
            d={d}
            fill="none"
            stroke="url(#flow-line)"
            strokeWidth={1.5}
            strokeDasharray="4 6"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={inView ? { pathLength: 1, opacity: 1 } : undefined}
            transition={{ duration: 1.2, delay: 0.4 + (i === 0 ? 0 : i <= 4 ? 0.6 : 1.2), ease }}
          />
        ))}
        {/* Pulses of light travelling down each line */}
        {inView &&
          !reduceMotion &&
          allPaths.map((d, i) => (
            <circle key={`pulse-${i}`} r={4} fill="#2563eb" filter="drop-shadow(0 0 6px #60a5fa)">
              <animateMotion dur="2.8s" repeatCount="indefinite" begin={`${1.6 + (i % 5) * 0.45}s`} path={d} />
            </circle>
          ))}
      </svg>

      <Node at={GOAL} delay={0.1} inView={inView}>
        <GoalCard active={inView} />
      </Node>

      <Node at={MASTER} delay={0.35} inView={inView}>
        <MasterOrb />
      </Node>

      {AGENTS.map((agent, i) => {
        const Icon = agent.icon
        return (
          <Node key={agent.key} at={{ x: AGENT_X, y: ROWS[i] }} delay={0.7 + i * 0.1} inView={inView}>
            <div className="flex w-[220px] items-center gap-3 rounded-2xl border border-foreground/[0.06] bg-card p-3 shadow-[0_12px_32px_-16px_rgba(7,11,24,0.25)]">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-wash text-brand">
                <Icon className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{agent.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{agent.task}</span>
              </span>
            </div>
          </Node>
        )
      })}

      {OUTPUTS.map((Output, i) => (
        <Node key={i} at={{ x: OUTPUT_X, y: ROWS[i] }} delay={1.3 + i * 0.12} inView={inView}>
          <Output />
        </Node>
      ))}
    </div>
  )
}

function Node({
  at,
  delay,
  inView,
  children,
}: {
  at: { x: number; y: number }
  delay: number
  inView: boolean
  children: React.ReactNode
}) {
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={pct(at.x, at.y)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.85, filter: "blur(8px)" }}
        animate={inView ? { opacity: 1, scale: 1, filter: "blur(0px)" } : undefined}
        transition={{ duration: 0.8, delay, ease }}
      >
        {children}
      </motion.div>
    </div>
  )
}

function GoalCard({ active }: { active: boolean }) {
  const [typed, setTyped] = useState(0)

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setTyped((t) => (t >= GOAL_TEXT.length ? t : t + 1)), 45)
    return () => clearInterval(timer)
  }, [active])

  return (
    <div className="w-[260px] rounded-2xl border border-foreground/[0.06] bg-card p-4 shadow-[0_20px_50px_-20px_rgba(7,11,24,0.3)]">
      <p className="font-mono text-[10px] tracking-wider text-muted-foreground/80 uppercase">Your goal</p>
      <p className="mt-2 min-h-[2.75rem] text-[15px] leading-snug font-medium">
        {GOAL_TEXT.slice(0, typed)}
        <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-brand" />
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[10px] text-muted-foreground">Brewline Coffee</span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-500",
            typed >= GOAL_TEXT.length ? "bg-brand text-white" : "bg-muted text-muted-foreground/80"
          )}
        >
          Launch
        </span>
      </div>
    </div>
  )
}

function MasterOrb() {
  const Icon = MASTER_AGENT.icon
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative flex size-[120px] items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand/15 [animation-duration:2.4s]" />
        <span className="absolute inset-2 rounded-full bg-brand/10" />
        <motion.span
          className="absolute inset-0 rounded-full border border-dashed border-brand/40"
          animate={{ rotate: 360 }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        />
        <span className="relative flex size-[76px] items-center justify-center rounded-full bg-linear-to-b from-brand-bright to-brand text-white shadow-[0_14px_30px_-12px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.4)]">
          <Icon className="size-8" />
        </span>
      </div>
      <p className="mt-2 text-sm font-medium">Master Agent</p>
      <p className="font-mono text-[10px] text-muted-foreground/80 uppercase">12 tasks planned</p>
    </div>
  )
}

const outputCard =
  "w-[230px] rounded-2xl border border-foreground/[0.06] bg-card p-3 shadow-[0_12px_32px_-16px_rgba(7,11,24,0.25)]"

const OUTPUTS = [
  function Trends() {
    return (
      <div className={outputCard}>
        <p className="font-mono text-[10px] text-muted-foreground/80 uppercase">6 trends found</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["#SlowMorning", "Latte art", "Home brew"].map((t) => (
            <span key={t} className="rounded-full bg-brand-wash px-2 py-0.5 text-[11px] text-brand">
              {t}
            </span>
          ))}
        </div>
      </div>
    )
  },
  function Draft() {
    return (
      <div className={cn(outputCard, "flex items-center gap-3")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={unsplash("1495474472287-4d71bcdd2085", 120)} alt="" className="size-12 rounded-lg object-cover" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">Monday, sorted ☕️</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Heart className="size-3" /> Carousel · 5 slides
          </p>
        </div>
      </div>
    )
  },
  function Scheduled() {
    return (
      <div className={cn(outputCard, "flex items-center gap-3")}>
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-white">
          <CalendarClock className="size-4" />
        </span>
        <div>
          <p className="text-xs font-medium">Tue · 6:00 PM</p>
          <p className="text-[11px] text-muted-foreground">TikTok, Instagram, LinkedIn +3</p>
        </div>
      </div>
    )
  },
  function Report() {
    return (
      <div className={outputCard}>
        <div className="flex items-center justify-between">
          <p className="font-mono text-[10px] text-muted-foreground/80 uppercase">Reach this week</p>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
            <TrendingUp className="size-3" /> +38%
          </span>
        </div>
        <svg viewBox="0 0 200 40" className="mt-2 h-8 w-full" aria-hidden>
          <path d="M0 34 L30 30 L60 32 L90 22 L120 24 L150 12 L200 6" fill="none" stroke="#2563eb" strokeWidth="2" />
          <path d="M0 34 L30 30 L60 32 L90 22 L120 24 L150 12 L200 6 L200 40 L0 40Z" fill="#2563eb" opacity="0.08" />
        </svg>
      </div>
    )
  },
]

// Phones and tablets get a simple vertical version of the diagram
function FlowList() {
  return (
    <div className="mt-14 space-y-3 lg:hidden">
      {[MASTER_AGENT, ...AGENTS].map((agent, i) => {
        const Icon = agent.icon
        return (
          <motion.div
            key={agent.key}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.08, ease }}
            className={cn(
              "flex items-center gap-3 rounded-2xl border border-foreground/[0.06] bg-card p-3",
              i > 0 && "ml-6"
            )}
          >
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                i === 0 ? "bg-brand text-white" : "bg-brand-wash text-brand"
              )}
            >
              <Icon className="size-[18px]" />
            </span>
            <span>
              <span className="block text-sm font-medium">{agent.name}</span>
              <span className="block text-xs text-muted-foreground">{agent.task}</span>
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}
