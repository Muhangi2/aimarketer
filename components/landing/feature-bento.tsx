"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react"
import { Check, MousePointer2, Sparkles } from "lucide-react"
import { cn } from "cn"
import { Brand } from "@/components/brand"
import { PlatformIcon, platform, type PlatformKey } from "./platforms"
import { SectionHeading, ease, reveal } from "./shared"

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

  return [ref, step] as const
}

// Card with a soft brand spotlight that follows the cursor
function Tile({
  className,
  title,
  body,
  children,
  delay = 0,
}: {
  className?: string
  title: string
  body: string
  children: React.ReactNode
  delay?: number
}) {
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty("--x", `${e.clientX - rect.left}px`)
    e.currentTarget.style.setProperty("--y", `${e.clientY - rect.top}px`)
  }

  return (
    <motion.div
      {...reveal}
      transition={{ ...reveal.transition, delay }}
      onMouseMove={onMove}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[28px] border border-black/[0.06] bg-white p-2 transition-shadow duration-500 hover:shadow-[0_30px_80px_-30px_rgba(0,0,0,0.18)]",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: "radial-gradient(420px circle at var(--x) var(--y), rgba(0,0,0,0.035), transparent 60%)" }}
      />
      <div className="relative flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-[22px] bg-paper p-6">
        {children}
      </div>
      <div className="relative px-4 pt-5 pb-4">
        <h3 className="text-lg font-medium tracking-tight">{title}</h3>
        <p className="mt-1.5 text-[15px] leading-relaxed text-slate-500">{body}</p>
      </div>
    </motion.div>
  )
}

const MESSAGES: { from: string; platform: PlatformKey; text: string; reply: string }[] = [
  { from: "maya.creates", platform: "instagram", text: "Where can I get this?? 😍", reply: "Link is in our bio! Use MAYA10 for 10% off ☕️" },
  { from: "jon_runs", platform: "tiktok", text: "Part 2 please, this was so useful", reply: "Filming it this week, stay tuned 🎬" },
  { from: "Daniel Okello", platform: "linkedin", text: "Do you offer bulk orders for offices?", reply: "We do! I have sent you our office plan by DM." },
  { from: "@ana_lopez", platform: "x", text: "Do you ship to Kenya?", reply: "We do! Delivery takes 5 to 7 days." },
]

function InboxDemo() {
  const [ref, step] = useTicker(2600)
  const current = step % MESSAGES.length
  const message = MESSAGES[current]

  return (
    <div ref={ref} className="w-full max-w-md space-y-2.5">
      {MESSAGES.map((m, i) => (
        <div
          key={m.from}
          className={cn(
            "flex items-center gap-3 rounded-2xl border bg-white p-3 transition-all duration-500",
            i === current ? "border-brand/40 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)]" : "border-black/[0.05] opacity-60"
          )}
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-ink text-white">
            <PlatformIcon name={m.platform} size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex justify-between text-xs">
              <span className="font-medium">{m.from}</span>
              <span className="font-mono text-[10px] text-slate-400 uppercase">{platform(m.platform).name}</span>
            </span>
            <span className="block truncate text-[13px] text-slate-600">{m.text}</span>
          </span>
        </div>
      ))}
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, y: 10, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.4, ease }}
          className="ml-8 rounded-2xl rounded-tr-md bg-brand p-3 text-[13px] text-white"
        >
          <span className="mb-1 flex items-center gap-1 font-mono text-[10px] text-white/70 uppercase">
            <Sparkles className="size-3" /> Suggested reply
          </span>
          {message.reply}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function PublishOrbit() {
  const reduceMotion = useReducedMotion()
  const platforms: PlatformKey[] = ["instagram", "tiktok", "youtube", "x", "linkedin", "facebook", "threads", "pinterest"]

  return (
    <div className="relative flex size-[220px] items-center justify-center">
      <span className="absolute inset-0 rounded-full border border-dashed border-brand/25" />
      <span className="absolute inset-10 rounded-full border border-brand/15" />
      <motion.div
        className="absolute inset-0"
        animate={reduceMotion ? undefined : { rotate: 360 }}
        transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
      >
        {platforms.map((p, i) => {
          // Whole pixels so the server and browser render the same position
          const angle = (i / platforms.length) * Math.PI * 2
          const x = Math.round(Math.cos(angle) * 110)
          const y = Math.round(Math.sin(angle) * 110)
          return (
            <span
              key={p}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
            >
              {/* Counter-rotate so the label stays upright while the ring turns */}
              <motion.span
                title={platform(p).name}
                className="flex size-10 items-center justify-center rounded-xl border border-black/[0.06] bg-white text-ink shadow-sm"
                animate={reduceMotion ? undefined : { rotate: -360 }}
                transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
              >
                <PlatformIcon name={p} size={18} />
              </motion.span>
            </span>
          )
        })}
      </motion.div>
      <span className="relative scale-125 rounded-2xl bg-white p-3 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.18)]">
        <Brand className="[&>span:last-child]:hidden" />
      </span>
    </div>
  )
}

const VOICES = [
  { tone: "Warm", text: "Mornings are better with a cup made just for you." },
  { tone: "Bold", text: "Bad coffee? Not on our watch. Upgrade today." },
  { tone: "Witty", text: "Our beans have more personality than your group chat." },
]

function VoiceDemo() {
  const [ref, step] = useTicker(2400)
  const voice = VOICES[step % VOICES.length]

  return (
    <div ref={ref} className="w-full max-w-[260px]">
      <div className="flex gap-1.5">
        {VOICES.map((v) => (
          <span
            key={v.tone}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs transition-colors duration-300",
              v.tone === voice.tone ? "bg-brand text-white" : "bg-white text-slate-500"
            )}
          >
            {v.tone}
          </span>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.p
          key={voice.tone}
          initial={{ opacity: 0, filter: "blur(6px)", y: 8 }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          exit={{ opacity: 0, filter: "blur(6px)", y: -8 }}
          transition={{ duration: 0.45, ease }}
          className="mt-4 rounded-2xl bg-white p-4 text-[15px] leading-snug shadow-sm"
        >
          “{voice.text}”
        </motion.p>
      </AnimatePresence>
    </div>
  )
}

const DRAFTS = ["Monday carousel", "Behind-the-scenes reel", "Customer story", "Weekend giveaway"]

function ApproveDemo() {
  const [ref, step] = useTicker(900)
  const approved = step % (DRAFTS.length + 3)

  return (
    <div ref={ref} className="w-full max-w-[260px] space-y-2">
      {DRAFTS.map((d, i) => (
        <div key={d} className="flex items-center justify-between rounded-xl bg-white px-3 py-2.5 text-[13px] shadow-sm">
          {d}
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-full transition-all duration-300",
              i < approved ? "scale-100 bg-brand text-white" : "scale-90 border border-slate-200 text-transparent"
            )}
          >
            <Check className="size-3" strokeWidth={3} />
          </span>
        </div>
      ))}
    </div>
  )
}

function DesktopDemo() {
  const reduceMotion = useReducedMotion()
  return (
    <div className="w-full max-w-[280px] overflow-hidden rounded-xl bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-black/[0.05] px-3 py-2">
        <span className="size-2 rounded-full bg-slate-200" />
        <span className="size-2 rounded-full bg-slate-200" />
        <span className="ml-2 flex-1 truncate rounded-md bg-paper px-2 py-0.5 font-mono text-[10px] text-slate-500">
          tiktok.com/discover
        </span>
      </div>
      <div className="relative grid h-36 grid-cols-3 gap-1.5 p-2">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={cn("rounded-md", i === 4 ? "bg-brand/25" : "bg-slate-100")} />
        ))}
        <motion.span
          className="absolute text-brand"
          animate={reduceMotion ? undefined : { left: ["15%", "62%", "40%", "15%"], top: ["20%", "30%", "70%", "20%"] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <MousePointer2 className="size-5 fill-brand" />
        </motion.span>
      </div>
    </div>
  )
}

export function FeatureBento() {
  return (
    <section id="features" data-nav-theme="light" className="scroll-mt-24 bg-paper px-5 py-28 text-ink sm:px-8 sm:py-36">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Features"
          title={
            <>
              Everything a marketing team does.{" "}
              <span className="text-slate-400">In one calm place.</span>
            </>
          }
        />
        <div className="mt-16 grid gap-4 md:grid-cols-6">
          <Tile
            className="md:col-span-4"
            title="One inbox for every comment and DM"
            body="Comments and DMs from every platform land together, with an answer already drafted in your voice."
          >
            <InboxDemo />
          </Tile>
          <Tile
            className="md:col-span-2"
            delay={0.08}
            title="Publish everywhere"
            body="One plan, formatted for each platform automatically."
          >
            <PublishOrbit />
          </Tile>
          <Tile className="md:col-span-2" title="Your brand voice, learned" body="Pick a tone once. Every post sticks to it.">
            <VoiceDemo />
          </Tile>
          <Tile
            className="md:col-span-2"
            delay={0.08}
            title="Approve in one click"
            body="Review the week’s drafts over coffee. The rest is handled."
          >
            <ApproveDemo />
          </Tile>
          <Tile
            className="md:col-span-2"
            delay={0.16}
            title="Agents with their own computers"
            body="Watch research happen live, and take the mouse at any time."
          >
            <DesktopDemo />
          </Tile>
        </div>
      </div>
    </section>
  )
}
