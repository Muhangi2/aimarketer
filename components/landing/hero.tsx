"use client"

import { motion } from "motion/react"
import { FeedWall } from "./feed-wall"
import { LivePost } from "./live-post"
import { PrimaryButton, ease } from "./shared"

// Each line must fit on one row at every breakpoint, so the size is capped by the longest line
const HEADLINE = [["Meet", "the", "AI", "team"], ["that", "runs", "your"], ["social", "media."]]

const FACTS = [
  { value: "5", label: "AI agents on your team" },
  { value: "13", label: "Platforms, one dashboard" },
  { value: "24/7", label: "Research, posting and replies" },
  { value: "10 min", label: "To launch your first campaign" },
]

// Light, clean hero: copy on the left, a framed live feed on the right. No tints or overlays
export function Hero() {
  return (
    <section data-cursor="hero" className="relative bg-transparent text-ink">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-5 pt-32 pb-16 sm:px-8 lg:min-h-[100svh] lg:grid-cols-[0.9fr_1.1fr] lg:pt-28 lg:pb-10">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease }}
            className="inline-flex items-center gap-2.5 rounded-full border border-foreground/10 bg-card py-1.5 pr-3.5 pl-2 text-sm text-muted-foreground"
          >
            <span className="rounded-full bg-brand px-2 py-0.5 font-mono text-[10px] tracking-wider text-white uppercase">
              New
            </span>
            Your agents now reply to comments and DMs
          </motion.div>

          <h1 className="mt-8 text-[2.6rem] leading-[0.98] font-medium tracking-[-0.05em] sm:text-7xl lg:text-[4.4rem] xl:text-[5rem]">
            {HEADLINE.map((line, l) => (
              <span key={l} className="block overflow-hidden pb-[0.08em] whitespace-nowrap">
                {line.map((word, w) => {
                  const index = HEADLINE.slice(0, l).flat().length + w
                  return (
                    <motion.span
                      key={w}
                      initial={{ y: "110%" }}
                      animate={{ y: "0%" }}
                      transition={{ duration: 0.9, delay: 0.2 + index * 0.05, ease }}
                      className={l === HEADLINE.length - 1 ? "mr-[0.22em] inline-block text-brand" : "mr-[0.22em] inline-block"}
                    >
                      {word}
                    </motion.span>
                  )
                })}
              </span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.75, ease }}
            className="mt-7 max-w-lg text-lg leading-relaxed text-muted-foreground"
          >
            Five AI agents research trends, write posts in your voice, publish them at the right moment and report back.
            You approve, they do the rest.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.9, ease }}
            className="mt-10 flex flex-wrap items-center gap-3"
          >
            <PrimaryButton href="/sign-up">Hire your AI team</PrimaryButton>
            <a
              href="#how-it-works"
              className="inline-flex h-12 items-center rounded-full border border-foreground/15 bg-card px-6 font-medium text-ink transition-colors hover:bg-foreground/[0.03]"
            >
              See how it works
            </a>
          </motion.div>

          <motion.dl
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.1 }}
            className="mt-14 grid max-w-xl grid-cols-2 gap-x-8 gap-y-6 border-t border-foreground/10 pt-8 sm:grid-cols-4"
          >
            {FACTS.map((fact) => (
              <div key={fact.label}>
                <dt className="text-2xl font-medium tracking-tight">{fact.value}</dt>
                <dd className="mt-1 text-xs leading-snug text-muted-foreground">{fact.label}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* Framed feed: posts scroll straight up in full colour, faded at the edges with a mask (no colour wash) */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4, ease }}
          className="relative h-[460px] overflow-hidden rounded-[32px] border border-foreground/[0.06] bg-night sm:h-[600px] lg:h-[760px]"
        >
          <FeedWall
            tilted={false}
            columns={3}
            className="[mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)]"
          />
          <div className="absolute inset-0 hidden items-center justify-center px-6 lg:flex">
            <LivePost />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
