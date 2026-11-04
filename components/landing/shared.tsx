"use client"

import Link from "next/link"
import { motion } from "motion/react"
import { ArrowRight, BrainCircuit, CalendarClock, PenLine, Search, TrendingUp, type LucideIcon } from "lucide-react"
import { cn } from "cn"

export const ease = [0.16, 1, 0.3, 1] as const

// Scroll-in animation shared by every section
export const reveal = {
  initial: { opacity: 0, y: 32, filter: "blur(10px)" },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.9, ease },
}

export type LandingAgent = { key: string; name: string; icon: LucideIcon; task: string }

export const MASTER_AGENT: LandingAgent = {
  key: "master",
  name: "Master Agent",
  icon: BrainCircuit,
  task: "Plans the campaign and hands out tasks",
}

export const AGENTS: LandingAgent[] = [
  { key: "research", name: "Research Agent", icon: Search, task: "Finds trends and ideas" },
  { key: "creator", name: "Creator Agent", icon: PenLine, task: "Writes posts in your voice" },
  { key: "scheduler", name: "Scheduler Agent", icon: CalendarClock, task: "Publishes at the best times" },
  { key: "analytics", name: "Analytics Agent", icon: TrendingUp, task: "Learns what works" },
]

export function unsplash(id: string, width = 600) {
  return `https://images.unsplash.com/photo-${id}?w=${width}&h=${width}&fit=crop&auto=format&q=70`
}

export function Eyebrow({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase",
        dark ? "text-brand-glow" : "text-brand"
      )}
    >
      <span className={cn("h-px w-6", dark ? "bg-brand-glow/60" : "bg-brand/50")} />
      {children}
    </p>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  dark,
  center,
  className,
}: {
  eyebrow: string
  title: React.ReactNode
  body?: string
  dark?: boolean
  center?: boolean
  className?: string
}) {
  return (
    <motion.div {...reveal} className={cn("max-w-3xl", center && "mx-auto text-center", className)}>
      <Eyebrow dark={dark}>{eyebrow}</Eyebrow>
      <h2 className="mt-5 text-[2.5rem] leading-[1.02] font-medium tracking-[-0.045em] text-balance sm:text-6xl">
        {title}
      </h2>
      {body && (
        <p
          className={cn(
            "mt-6 max-w-xl text-lg leading-relaxed text-pretty",
            center && "mx-auto",
            dark ? "text-white/60" : "text-slate-600"
          )}
        >
          {body}
        </p>
      )}
    </motion.div>
  )
}

export function PrimaryButton({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-full bg-brand pr-5 pl-6 font-medium text-white",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_30px_-8px_rgba(0,0,0,0.18)] transition-transform active:scale-[0.97]",
        className
      )}
    >
      {/* Light sweep on hover */}
      <span className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      <span className="relative">{children}</span>
      <ArrowRight className="relative size-4 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>
  )
}
