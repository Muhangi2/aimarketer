"use client"

import { useEffect, useState } from "react"
import NumberFlow from "@number-flow/react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { CalendarCheck, Heart, MessageCircle } from "lucide-react"
import { cn } from "cn"
import { PlatformIcon, platform, type PlatformKey } from "./platforms"
import { AGENTS, ease, unsplash } from "./shared"

// PLACEHOLDER posts the hero builds one after another
const POSTS = [
  {
    handle: "brewline.coffee",
    image: "1495474472287-4d71bcdd2085",
    caption: "Two oat flat whites and a Monday that finally makes sense ☕️",
    slot: "Tue · 8:30 AM",
    likes: 2481,
    comments: 136,
    platforms: ["instagram", "facebook", "threads", "x", "pinterest"] as PlatformKey[],
  },
  {
    handle: "northpeak",
    image: "1501785888041-af3ef285b470",
    caption: "Lake days are back. Tag the friend who is coming with you 🛶",
    slot: "Fri · 6:00 PM",
    likes: 8902,
    comments: 412,
    platforms: ["tiktok", "youtube", "instagram", "bluesky"] as PlatformKey[],
  },
  {
    handle: "greenbowl.kitchen",
    image: "1546069901-ba9599a7e63c",
    caption: "Lunch that keeps up with you: 12 minutes, 32g of protein 🥗",
    slot: "Wed · 12:15 PM",
    likes: 1206,
    comments: 88,
    platforms: ["linkedin", "x", "facebook", "instagram", "reddit", "telegram"] as PlatformKey[],
  },
]

// Build stages, in order. Each one is handled by a different agent
const STAGES = ["research", "design", "write", "schedule", "results", "publish"] as const
type Stage = (typeof STAGES)[number]

const STAGE_LABEL: Record<Stage, { agent: number; text: string }> = {
  research: { agent: 0, text: "Picking a trending angle" },
  design: { agent: 1, text: "Designing the visual" },
  write: { agent: 1, text: "Writing the caption" },
  schedule: { agent: 2, text: "Formatting for every platform" },
  results: { agent: 3, text: "Tracking the results" },
  publish: { agent: 2, text: "Published everywhere" },
}

const TYPE_MS = 32

function stageDurations(captionLength: number): Record<Stage, number> {
  return {
    research: 900,
    design: 1000,
    write: captionLength * TYPE_MS + 500,
    schedule: 1500,
    results: 1900,
    publish: 900,
  }
}

export function LivePost() {
  const reduceMotion = useReducedMotion()
  const [postIndex, setPostIndex] = useState(0)
  const [stage, setStage] = useState<Stage>(reduceMotion ? "results" : "research")
  const [typed, setTyped] = useState(0)

  const post = POSTS[postIndex]
  const at = STAGES.indexOf(stage)
  const reached = (s: Stage) => at >= STAGES.indexOf(s)

  // Walk through the stages, then move on to the next post
  useEffect(() => {
    if (reduceMotion) return
    const timer = setTimeout(() => {
      if (stage === "publish") {
        setPostIndex((i) => (i + 1) % POSTS.length)
        setTyped(0)
        setStage("research")
      } else {
        setStage(STAGES[at + 1])
      }
    }, stageDurations(post.caption.length)[stage])
    return () => clearTimeout(timer)
  }, [stage, at, post.caption.length, reduceMotion])

  // Type the caption during the "write" stage
  useEffect(() => {
    if (stage !== "write") return
    const timer = setInterval(() => setTyped((t) => Math.min(t + 1, post.caption.length)), TYPE_MS)
    return () => clearInterval(timer)
  }, [stage, post.caption.length])

  const caption = reduceMotion || reached("schedule") ? post.caption : post.caption.slice(0, typed)
  const label = STAGE_LABEL[stage]
  const agent = AGENTS[label.agent]
  const AgentIcon = agent.icon

  return (
    <div className="relative hidden w-full max-w-[300px] lg:block">
      {/* Which agent is working right now */}
      <div className="mb-4 flex h-10 items-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={stage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease }}
            className="flex items-center gap-2.5 rounded-full bg-scrim py-1.5 pr-4 pl-1.5 text-sm text-white shadow-lg"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-brand">
              <AgentIcon className="size-3.5" />
            </span>
            <span className="font-medium">{agent.name}</span>
            <span className="text-white/50">{label.text}</span>
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        <motion.article
          key={postIndex}
          initial={{ opacity: 0, y: 40, scale: 0.92, rotate: -2 }}
          animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
          // Finished posts fly up into the feed behind
          exit={{ opacity: 0, y: -120, x: 80, scale: 0.7, rotate: 6 }}
          transition={{ duration: 0.7, ease }}
          className="relative rounded-[26px] bg-card p-3 text-ink shadow-[0_40px_80px_-30px_rgba(0,0,0,0.75)]"
        >
          <div className="flex items-center gap-2.5 px-1 pt-0.5 pb-3">
            <span className="size-8 rounded-full bg-linear-to-br from-brand-glow to-brand" />
            <span className="text-sm font-semibold">{post.handle}</span>
            <span
              className={cn(
                "ml-auto rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase transition-colors duration-500",
                reached("publish") ? "bg-brand text-white" : "bg-brand-wash text-brand"
              )}
            >
              {reached("publish") ? "Live" : "Draft"}
            </span>
          </div>

          <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
            {/* Placeholder shimmer until the visual is "designed" */}
            {!reached("design") && (
              <div className="absolute inset-0 animate-pulse bg-linear-to-br from-muted to-muted-foreground/20" />
            )}
            <motion.img
              src={unsplash(post.image, 720)}
              alt=""
              className="size-full object-cover"
              initial={false}
              animate={
                reached("design")
                  ? { clipPath: "inset(0% 0% 0% 0% round 16px)", scale: 1, filter: "saturate(1)" }
                  : { clipPath: "inset(100% 0% 0% 0% round 16px)", scale: 1.15, filter: "saturate(0)" }
              }
              transition={{ duration: 0.9, ease }}
            />

            <AnimatePresence>
              {reached("schedule") && (
                <motion.span
                  initial={{ opacity: 0, scale: 1.8, rotate: -14 }}
                  animate={{ opacity: 1, scale: 1, rotate: -4 }}
                  transition={{ type: "spring", stiffness: 420, damping: 18 }}
                  className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white shadow-lg"
                >
                  <CalendarCheck className="size-3.5" />
                  {post.slot}
                </motion.span>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {reached("results") && <FloatingHearts />}
            </AnimatePresence>
          </div>

          <p className="mt-3 min-h-[2.75rem] px-1 text-sm leading-snug text-foreground/80">
            {caption}
            {stage === "write" && <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-brand" />}
          </p>

          <div className="mt-3 flex items-center gap-5 border-t border-border px-1 pt-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Heart className={cn("size-4 transition-colors", reached("results") && "fill-brand text-brand")} />
              <NumberFlow value={reached("results") ? post.likes : 0} />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="size-4" />
              <NumberFlow value={reached("results") ? post.comments : 0} />
            </span>
          </div>

          {/* One post, adapted and sent to every platform it suits */}
          <div className="mt-3 flex items-center gap-1.5 rounded-2xl bg-paper p-2">
            <span className="mr-auto pl-1 font-mono text-[10px] text-muted-foreground uppercase">
              {reached("publish") ? `Live on ${post.platforms.length}` : `Posting to ${post.platforms.length}`}
            </span>
            {post.platforms.map((key, i) => (
              <motion.span
                key={key}
                title={platform(key).name}
                initial={false}
                animate={reached("schedule") ? { scale: 1, opacity: 1 } : { scale: 0.85, opacity: 0.35 }}
                transition={{ type: "spring", stiffness: 420, damping: 20, delay: reached("schedule") ? i * 0.18 : 0 }}
                className={cn(
                  "flex size-7 items-center justify-center rounded-lg transition-colors duration-300",
                  reached("schedule") ? "bg-foreground text-background" : "bg-card text-muted-foreground/80"
                )}
              >
                <PlatformIcon name={key} size={13} />
              </motion.span>
            ))}
          </div>
        </motion.article>
      </AnimatePresence>
    </div>
  )
}

function FloatingHearts() {
  return (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          className="absolute bottom-3 text-white drop-shadow"
          style={{ right: 16 + i * 14 }}
          initial={{ opacity: 0, y: 0, scale: 0.6 }}
          animate={{ opacity: [0, 1, 0], y: -140 - i * 20, scale: 1, x: (i % 2 ? 1 : -1) * 12 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.6, delay: i * 0.15, ease: "easeOut" }}
        >
          <Heart className="size-5 fill-white" />
        </motion.span>
      ))}
    </>
  )
}
