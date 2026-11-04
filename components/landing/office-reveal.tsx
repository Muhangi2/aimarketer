"use client"

import { useRef } from "react"
import { motion, useScroll, useTransform } from "motion/react"
import { Globe, MousePointer2 } from "lucide-react"
import { AgentOffice } from "@/components/office/agent-office"
import type { OfficeScene } from "@/lib/office-scene"
import { SectionHeading } from "./shared"

const CALLOUTS = [
  { icon: Globe, title: "Research Agent", text: "Browsing tiktok.com/discover", className: "left-[2%] top-[18%]" },
  { icon: MousePointer2, title: "You took control", text: "Creator Agent's desktop", className: "right-[3%] top-[48%]" },
]

// The office window grows from a small card to nearly full width as it scrolls into view
export function OfficeReveal({ scene }: { scene: OfficeScene }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] })
  const scale = useTransform(scrollYProgress, [0, 1], [0.72, 1])
  const radius = useTransform(scrollYProgress, [0, 1], [64, 28])
  const tilt = useTransform(scrollYProgress, [0, 1], [24, 0])
  const calloutOpacity = useTransform(scrollYProgress, [0.75, 1], [0, 1])

  return (
    <section className="relative overflow-hidden bg-night px-5 pt-16 pb-32 text-ink sm:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          center
          eyebrow="The Agent Office"
          title={
            <>
              Watch your team work. <span className="text-ink/55">Live.</span>
            </>
          }
          body="Every agent has a desk in your office. See who is busy, open their computer and take over whenever you want."
        />

        <div ref={ref} className="relative mt-16 [perspective:1600px]">
          <motion.div style={{ scale, rotateX: tilt }} className="relative mx-auto max-w-6xl origin-top">
            <motion.div
              style={{ borderRadius: radius }}
              className="overflow-hidden border border-black/15 bg-black/[0.04] p-2 shadow-[0_40px_100px_-40px_rgba(0,0,0,0.8)]"
            >
              <motion.div style={{ borderRadius: radius }} className="overflow-hidden">
                <AgentOffice scene={scene} />
              </motion.div>
            </motion.div>

            {CALLOUTS.map(({ icon: Icon, title, text, className }) => (
              <motion.div
                key={title}
                style={{ opacity: calloutOpacity }}
                className={`absolute hidden items-center gap-3 rounded-2xl border border-white/10 bg-ink/85 p-3 pr-4 text-white shadow-2xl backdrop-blur-xl md:flex ${className}`}
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand text-white">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block font-mono text-[11px] text-white/60">{text}</span>
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
