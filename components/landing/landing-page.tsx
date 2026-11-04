"use client"

import { useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "motion/react"
import { Check, Plus } from "lucide-react"
import { cn } from "cn"
import { Brand } from "@/components/brand"
import type { OfficeScene } from "@/lib/office-scene"
import { AgentFlow } from "./agent-flow"
import { FeatureBento } from "./feature-bento"
import { FocusTestimonials } from "./focus-testimonials"
import { Hero } from "./hero"
import { HowItWorks } from "./how-it-works"
import { OfficeReveal } from "./office-reveal"
import { PlatformStrip } from "./platform-strip"
import { PricingCard } from "./pricing-card"
import { SectionHeading, reveal } from "./shared"
import { NAV_ITEMS, SiteHeader } from "./site-header"

// Section rhythm: ink hero, paper product, ink story and office, paper features and reviews,
// ink pricing, paper FAQ, ink close
export function LandingPage({ scene }: { scene: OfficeScene }) {
  return (
    <div className="min-h-svh bg-paper text-ink antialiased selection:bg-brand selection:text-white">
      <SiteHeader />
      <main>
        <Hero />
        <PlatformStrip />
        <AgentFlow />
        <HowItWorks />
        <OfficeReveal scene={scene} />
        <FeatureBento />
        <Reviews />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}

function Reviews() {
  return (
    <section id="reviews" data-nav-theme="light" className="scroll-mt-24 bg-paper px-5 pb-28 sm:px-8 sm:pb-36">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Loved by small teams"
          title={
            <>
              They handed social over. <span className="text-slate-400">Here is how it went.</span>
            </>
          }
        />
        <motion.div {...reveal} className="mt-14">
          <FocusTestimonials />
        </motion.div>
      </div>
    </section>
  )
}

const INCLUDED = [
  "All four agents plus the Master Agent",
  "Publishing to all 13 supported platforms",
  "Unified inbox for comments and DMs",
  "Live Agent Office and activity history",
  "Weekly performance reports",
]

function Pricing() {
  return (
    <section id="pricing" className="relative scroll-mt-24 overflow-hidden bg-night px-5 py-28 text-ink sm:px-8 sm:py-36">
      <div className="relative mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-2 lg:gap-24">
        <div>
          <SectionHeading
            eyebrow="Pricing"
            title={
              <>
                A whole marketing team. <span className="text-ink/55">Less than one freelancer.</span>
              </>
            }
            body="Start with a free trial and cancel anytime. Every plan includes:"
          />
          <motion.ul {...reveal} className="mt-8 space-y-3.5">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-center gap-3 text-ink/75">
                <span className="flex size-5 items-center justify-center rounded-full bg-brand">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </motion.ul>
        </div>
        <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.1 }} className="flex justify-center text-ink lg:justify-end">
          <PricingCard />
        </motion.div>
      </div>
    </section>
  )
}

const FAQS = [
  {
    q: "Do I need any marketing experience?",
    a: "No. Tell the Master Agent your goal and a little about your brand. The agents plan, write and publish, and you approve what goes out.",
  },
  {
    q: "Will the posts sound like my brand?",
    a: "Yes. The Creator Agent learns your tone from your answers during setup and your past posts, and you can adjust the voice at any time.",
  },
  {
    q: "Does anything get posted without my approval?",
    a: "Only if you allow it. By default every draft waits for your review, and you can switch on auto-publishing per campaign.",
  },
  {
    q: "Which platforms are supported?",
    a: "Instagram, TikTok, YouTube, X, LinkedIn, Facebook, Threads, Pinterest, Bluesky, Reddit, Mastodon, Discord and Telegram. Each post is adapted to the format that works best on each one.",
  },
  {
    q: "Can I watch or stop an agent?",
    a: "Always. The Agent Office shows what each agent is doing live, and you can pause any agent or take over its computer.",
  },
]

function Faq() {
  const [open, setOpen] = useState(0)

  return (
    <section id="faq" data-nav-theme="light" className="scroll-mt-24 bg-paper px-5 py-28 sm:px-8 sm:py-36">
      <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions, answered."
          body="Anything else? Our team replies within a day, and your agents never sleep."
        />
        <motion.div {...reveal} className="divide-y divide-black/[0.07] border-y border-black/[0.07]">
          {FAQS.map((item, i) => (
            <div key={item.q}>
              <button
                type="button"
                onClick={() => setOpen(open === i ? -1 : i)}
                aria-expanded={open === i}
                className="flex w-full items-center justify-between gap-6 py-6 text-left text-lg font-medium tracking-tight"
              >
                {item.q}
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border transition-all duration-300",
                    open === i ? "rotate-45 border-brand bg-brand text-white" : "border-black/10 text-slate-500"
                  )}
                >
                  <Plus className="size-4" />
                </span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="max-w-xl pb-6 text-[15px] leading-relaxed text-slate-600">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

// Solid brand panel: no photos or tint, just the message and one button
function FinalCta() {
  return (
    <section className="bg-night px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="relative overflow-hidden rounded-[32px] bg-brand px-6 py-28 text-center text-white sm:py-36">
        <motion.div {...reveal}>
          <p className="font-mono text-[11px] tracking-[0.14em] text-white/70 uppercase">Ready when you are</p>
          <h2 className="mx-auto mt-6 max-w-4xl text-[2.75rem] leading-[1] font-medium tracking-[-0.05em] text-balance sm:text-7xl">
            Your agents can start on Monday.
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg text-white/80">
            Set up your first campaign in about ten minutes, then watch the team get to work.
          </p>
          <div className="mt-10 flex justify-center">
            <Link
              href="/sign-up"
              className="inline-flex h-12 items-center rounded-full bg-white px-7 font-medium text-brand transition-transform active:scale-[0.97]"
            >
              Get started free
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="overflow-hidden bg-night px-5 pt-20 text-ink sm:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-12 md:flex-row">
          <div className="max-w-xs">
            <Brand />
            <p className="mt-5 text-sm leading-relaxed text-ink/75">
              An AI marketing team that researches, creates, publishes and learns, so you can get back to your business.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-20 gap-y-4 text-sm">
            <p className="font-mono text-[11px] tracking-wider text-ink/55 uppercase">Product</p>
            <p className="font-mono text-[11px] tracking-wider text-ink/55 uppercase">Account</p>
            <div className="flex flex-col gap-3">
              {NAV_ITEMS.map((item) => (
                <a key={item.href} href={item.href} className="text-ink/75 transition-colors hover:text-ink">
                  {item.label}
                </a>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <Link href="/sign-in" className="text-ink/75 transition-colors hover:text-ink">
                Sign in
              </Link>
              <Link href="/sign-up" className="text-ink/75 transition-colors hover:text-ink">
                Create account
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-16 flex items-center justify-between border-t border-black/12 py-6 font-mono text-[11px] text-ink/55 uppercase">
          <span>© {new Date().getFullYear()} Hively</span>
          <span>Made with agents</span>
        </div>
      </div>
      {/* Oversized wordmark that bleeds off the bottom edge */}
      <motion.p
        aria-hidden
        initial={{ y: "40%", opacity: 0 }}
        whileInView={{ y: "0%", opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        className="pointer-events-none mx-auto -mb-[0.2em] max-w-7xl bg-linear-to-b from-black/[0.1] to-transparent bg-clip-text text-center text-[clamp(4rem,16vw,15rem)] leading-none font-semibold tracking-[-0.06em] whitespace-nowrap text-transparent select-none"
      >
        Hively
      </motion.p>
    </footer>
  )
}
