"use client"

import { useRef, useState } from "react"
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useTransform } from "motion/react"
import { cn } from "cn"
import { AnalyticsVisual, CreatorVisual, ResearchVisual, SchedulerVisual } from "./agent-visuals"
import { AGENTS, Eyebrow, ease } from "./shared"

const STEPS = [
  {
    title: "Research",
    heading: "It starts by listening.",
    body: "The Research Agent scans trends, competitors and news in your niche every morning, often on its own cloud computer that you can watch live.",
    Visual: ResearchVisual,
  },
  {
    title: "Create",
    heading: "Posts that sound like you.",
    body: "The Creator Agent turns the research into captions, carousels, reels scripts and threads in your brand voice. Edit anything, or approve a week in one click.",
    Visual: CreatorVisual,
  },
  {
    title: "Publish",
    heading: "Out the door at the perfect moment.",
    body: "The Scheduler Agent fills your calendar and publishes everywhere your audience is, from TikTok and Instagram to LinkedIn and X, each in the format that platform loves.",
    Visual: SchedulerVisual,
  },
  {
    title: "Improve",
    heading: "Smarter every single week.",
    body: "The Analytics Agent explains what worked in plain language and feeds the lessons into the next plan, so results compound.",
    Visual: AnalyticsVisual,
  },
]

// A tall section whose content stays pinned while scrolling moves through the four steps
export function HowItWorks() {
  const ref = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] })
  const progress = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setActive(Math.min(STEPS.length - 1, Math.floor(v * STEPS.length)))
  })

  const step = STEPS[active]
  const agent = AGENTS[active]
  const Icon = agent.icon

  return (
    <section id="how-it-works" ref={ref} className="relative scroll-mt-0 bg-night text-ink" style={{ height: `${STEPS.length * 85 + 40}vh` }}>
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">

        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
          <div>
            <Eyebrow>How it works</Eyebrow>

            <div className="mt-8 flex gap-2">
              {STEPS.map((s, i) => (
                <span
                  key={s.title}
                  className={cn(
                    "rounded-full border px-3 py-1 font-mono text-[11px] uppercase transition-all duration-500",
                    i === active ? "border-brand bg-brand text-white" : "border-black/12 text-ink/55"
                  )}
                >
                  0{i + 1} {s.title}
                </span>
              ))}
            </div>

            <div className="relative mt-6 min-h-[12.5rem] sm:mt-8 sm:min-h-[13rem]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -16, filter: "blur(8px)" }}
                  transition={{ duration: 0.55, ease }}
                >
                  <h2 className="text-4xl leading-[1.02] font-medium tracking-[-0.045em] sm:text-6xl">{step.heading}</h2>
                  <p className="mt-6 max-w-md text-lg leading-relaxed text-ink/75">{step.body}</p>
                  <p className="mt-6 inline-flex items-center gap-2 text-sm text-ink/75">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-brand">
                      <Icon className="size-3.5" />
                    </span>
                    {agent.name}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="mt-10 h-px w-full max-w-md bg-black/10">
              <motion.div style={{ width: progress }} className="h-px bg-brand-glow" />
            </div>
          </div>

          {/* Plain white card for the live demo */}
          <div className="relative flex h-[40svh] w-full items-center justify-center overflow-hidden rounded-[28px] border border-black/[0.06] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.12)] sm:p-10 lg:aspect-square lg:h-auto lg:max-h-[560px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, scale: 0.92, rotateX: 18, filter: "blur(10px)" }}
                animate={{ opacity: 1, scale: 1, rotateX: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 1.04, filter: "blur(10px)" }}
                transition={{ duration: 0.6, ease }}
                className="relative flex w-full origin-center scale-[0.72] justify-center [perspective:1000px] sm:scale-90 lg:scale-100"
              >
                <step.Visual />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}
