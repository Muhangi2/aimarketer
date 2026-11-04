"use client"

import { motion, useReducedMotion } from "motion/react"
import { CalendarClock, Heart, MessageCircle, Play, Repeat2, Sparkles } from "lucide-react"
import { cn } from "cn"
import { PlatformIcon, platform, type PlatformKey } from "./platforms"
import { unsplash } from "./shared"

type Badge = { label: string; kind: "scheduled" | "drafted" }

// Each platform gets the post shape people recognise from it
type Post =
  | { format: "square"; platform: PlatformKey; handle: string; image: string; caption: string; likes: string; badge?: Badge }
  | { format: "vertical"; platform: PlatformKey; handle: string; image: string; caption: string; likes: string; badge?: Badge }
  | { format: "video"; platform: PlatformKey; handle: string; image: string; title: string; meta: string; duration: string; badge?: Badge }
  | { format: "text"; platform: PlatformKey; handle: string; name: string; text: string; image?: string; likes: string; badge?: Badge }

// PLACEHOLDER accounts and posts that show what the agents produce
const POSTS: Post[] = [
  { format: "square", platform: "instagram", handle: "brewline.coffee", image: "1495474472287-4d71bcdd2085", caption: "Two oat flat whites and a Monday that finally makes sense", likes: "2,481", badge: { label: "Tue · 8:30 AM", kind: "scheduled" } },
  { format: "vertical", platform: "tiktok", handle: "fitloop", image: "1517836357463-d25dfeac3438", caption: "5 moves for stronger mornings #fittok", likes: "48.2K" },
  { format: "text", platform: "x", handle: "brewline", name: "Brewline Coffee", text: "Hot take: the best coffee is the one someone else made for you. Agree?", likes: "1,204", badge: { label: "Written by Creator Agent", kind: "drafted" } },
  { format: "video", platform: "youtube", handle: "Framed by Kev", image: "1516035069371-29a1b244cc32", title: "My whole kit for shooting reels on a budget", meta: "84K views · 2 days ago", duration: "12:48" },
  { format: "text", platform: "linkedin", handle: "atelier-nine", name: "Atelier Nine", text: "We grew our online store 3x this year. Here is what changed in our content strategy 👇", image: "1441986300917-64674bd600d8", likes: "892" },
  { format: "vertical", platform: "pinterest", handle: "linen.and.co", image: "1490481651871-ab68de25d43d", caption: "Capsule wardrobe: 12 pieces, 30 outfits", likes: "6.1K", badge: { label: "Fri · 6:00 PM", kind: "scheduled" } },
  { format: "square", platform: "facebook", handle: "Forno Roma", image: "1513104890138-7c749659a591", caption: "Friday is pizza day and we do not make the rules", likes: "5,770" },
  { format: "text", platform: "threads", handle: "northpeak", name: "Northpeak", text: "Lake days are back. Who is coming with us this weekend? 🛶", image: "1501785888041-af3ef285b470", likes: "3,045" },
  { format: "vertical", platform: "tiktok", handle: "greenbowl.kitchen", image: "1546069901-ba9599a7e63c", caption: "Lunch in 12 minutes, 32g protein", likes: "21.7K", badge: { label: "Written by Creator Agent", kind: "drafted" } },
  { format: "text", platform: "bluesky", handle: "soundcraft.bsky.social", name: "Soundcraft", text: "40 hours of battery. Zero hours of noise. Our new headphones ship today.", image: "1505740420928-5e560c06d30e", likes: "644" },
  { format: "video", platform: "youtube", handle: "Slow Travel", image: "1507525428034-b723cf961d3e", title: "7 days, 1 backpack: the slow travel guide", meta: "212K views · 1 week ago", duration: "18:02", badge: { label: "Sat · 11:00 AM", kind: "scheduled" } },
  { format: "square", platform: "instagram", handle: "happytails", image: "1543466835-00a7907e9de1", caption: "Rate this smile from 1 to 10. We will wait.", likes: "12.4K" },
  { format: "text", platform: "linkedin", handle: "tempo", name: "Tempo Watches", text: "Minimal on the outside, smart where it counts. Meet the team behind our new range.", likes: "1,118" },
  { format: "vertical", platform: "pinterest", handle: "leaf.studio", image: "1485955900006-10f4d324d411", caption: "Low light, low effort, high reward plants", likes: "9.3K" },
  { format: "square", platform: "instagram", handle: "atelier.nine", image: "1483985988355-763728e1935b", caption: "The winter edit has landed. Link in bio.", likes: "6,054", badge: { label: "Written by Creator Agent", kind: "drafted" } },
  { format: "text", platform: "x", handle: "thriftlab", name: "Thrift Lab", text: "Every piece under $30. Every piece one of one. Drop goes live at noon.", image: "1512436991641-6745cdb1723f", likes: "2,210" },
  { format: "video", platform: "youtube", handle: "Greenbowl Kitchen", image: "1504674900247-0877df9cc836", title: "Steak night, the 20 minute version", meta: "56K views · 3 days ago", duration: "09:14" },
  { format: "vertical", platform: "tiktok", handle: "sunnyside.co", image: "1469334031218-e382a71b716b", caption: "Summer drop, part two. Which pair is yours?", likes: "33.9K" },
]

function PlatformTag({ name, light }: { name: PlatformKey; light?: boolean }) {
  return (
    <span className={cn("ml-auto inline-flex items-center gap-1 text-[10px] font-medium", light ? "text-white" : "text-slate-500")}>
      <PlatformIcon name={name} size={11} />
      {platform(name).name}
    </span>
  )
}

function BadgeChip({ badge }: { badge: Badge }) {
  return (
    <span
      className={cn(
        "absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium",
        badge.kind === "scheduled" ? "bg-brand text-white" : "bg-white text-brand"
      )}
    >
      {badge.kind === "scheduled" ? <CalendarClock className="size-3" /> : <Sparkles className="size-3" />}
      {badge.label}
    </span>
  )
}

function Avatar() {
  return <span className="size-6 shrink-0 rounded-full bg-linear-to-br from-brand-glow to-brand" />
}

function Img({ id, className }: { id: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={unsplash(id, 420)} alt="" decoding="async" className={cn("size-full object-cover", className)} />
}

const card = "relative overflow-hidden rounded-[18px] border border-white/10 bg-white text-slate-900 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)]"

function PostCard({ post }: { post: Post }) {
  if (post.format === "vertical") {
    return (
      <div className={cn(card, "aspect-[9/14]")}>
        <Img id={post.image} className="absolute inset-0" />
        {post.badge && <BadgeChip badge={post.badge} />}
        <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/10 to-black/30" />
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-2.5 text-white">
          {!post.badge && <span className="text-[11px] font-semibold">@{post.handle}</span>}
          <PlatformTag name={post.platform} light />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-2 p-3 text-white">
          <p className="line-clamp-2 flex-1 text-[11px] leading-snug">{post.caption}</p>
          <span className="flex flex-col items-center gap-0.5 text-[10px]">
            <Heart className="size-4 fill-white" />
            {post.likes}
          </span>
        </div>
      </div>
    )
  }

  if (post.format === "video") {
    return (
      <div className={cn(card, "p-2")}>
        <div className="relative aspect-video overflow-hidden rounded-xl">
          <Img id={post.image} />
          {post.badge && <BadgeChip badge={post.badge} />}
          <span className="absolute inset-0 m-auto flex size-9 items-center justify-center rounded-full bg-black/60 text-white">
            <Play className="size-4 fill-white" />
          </span>
          <span className="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1 py-0.5 font-mono text-[9px] text-white">
            {post.duration}
          </span>
        </div>
        <div className="flex gap-2 px-0.5 pt-2 pb-0.5">
          <Avatar />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-[11px] leading-snug font-semibold">{post.title}</p>
            <p className="mt-0.5 flex items-center text-[10px] text-slate-500">
              {post.handle} · {post.meta}
            </p>
          </div>
        </div>
        <div className="flex px-0.5 pt-1">
          <PlatformTag name={post.platform} />
        </div>
      </div>
    )
  }

  if (post.format === "text") {
    return (
      <div className={cn(card, "p-3")}>
        <div className="flex items-center gap-2">
          <Avatar />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[11px] font-semibold">{post.name}</span>
            <span className="block truncate text-[10px] text-slate-400">@{post.handle}</span>
          </span>
          <PlatformTag name={post.platform} />
        </div>
        <p className="mt-2.5 text-[12px] leading-snug">{post.text}</p>
        {post.image && (
          <div className="relative mt-2.5 aspect-[16/10] overflow-hidden rounded-xl">
            <Img id={post.image} />
          </div>
        )}
        {post.badge && (
          <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-brand-wash px-2 py-1 text-[10px] font-medium text-brand">
            <Sparkles className="size-3" /> {post.badge.label}
          </span>
        )}
        <div className="mt-2.5 flex items-center gap-4 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="size-3" /> {post.text.length}
          </span>
          <span className="inline-flex items-center gap-1">
            <Repeat2 className="size-3" /> {Math.round(post.text.length * 1.7)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3" /> {post.likes}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn(card, "p-2")}>
      <div className="flex items-center gap-2 px-1 pt-0.5 pb-2">
        <Avatar />
        <span className="truncate text-[11px] font-semibold">{post.handle}</span>
        <PlatformTag name={post.platform} />
      </div>
      <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
        <Img id={post.image} />
        {post.badge && <BadgeChip badge={post.badge} />}
      </div>
      <p className="mt-2 line-clamp-2 px-1 text-[11px] leading-snug text-slate-600">{post.caption}</p>
      <div className="mt-2 flex items-center gap-3 px-1 pb-1 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Heart className="size-3" /> {post.likes}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="size-3" /> {post.caption.length * 3}
        </span>
      </div>
    </div>
  )
}

/**
 * Columns of posts from every platform drifting up and down, tilted in perspective.
 * Used as the full-bleed backdrop of the hero and the closing call to action.
 */
export function FeedWall({ className, columns = 6, tilted = true }: { className?: string; columns?: number; tilted?: boolean }) {
  const reduceMotion = useReducedMotion()

  const cols = Array.from({ length: columns }, (_, c) => {
    // Each column starts at a different post so neighbours never match
    const start = (c * 5) % POSTS.length
    return [...POSTS.slice(start), ...POSTS.slice(0, start)].slice(0, 6)
  })

  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden [perspective:1600px]", className)}>
      <div
        // Anchored to the top: the columns are very tall, so centring on their height pushes them off screen
        className={
          tilted
            ? "absolute -top-[35%] -left-[12%] flex w-[170%] gap-4 sm:w-[128%] sm:gap-5"
            : "absolute inset-x-0 top-0 flex gap-4 px-4"
        }
        style={tilted ? { transform: "rotateX(20deg) rotateZ(-14deg) rotateY(6deg)", transformOrigin: "50% 0%" } : undefined}
      >
        {cols.map((posts, c) => (
          <motion.div
            key={c}
            className="flex min-w-0 flex-1 flex-col gap-4 sm:gap-5"
            animate={reduceMotion ? undefined : { y: c % 2 ? ["-50%", "0%"] : ["0%", "-50%"] }}
            transition={{ duration: 46 + c * 7, repeat: Infinity, ease: "linear" }}
          >
            {/* The list is doubled so the loop is seamless */}
            {[...posts, ...posts].map((post, i) => (
              <PostCard key={i} post={post} />
            ))}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
