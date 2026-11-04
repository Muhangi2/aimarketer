import type { AspectRatio, PlatformPreset } from "@/lib/imagekit/edits"

/* Platforms a post can be scheduled to, and each one's limits. Safe to import from client code. */

export const POST_PLATFORMS = ["instagram", "youtube", "tiktok"] as const
export type PostPlatform = (typeof POST_PLATFORMS)[number]

export type PlatformInfo = {
  label: string
  captionLimit: number
  hashtagLimit: number
  titleLimit: number | null
  // Instagram can't publish a post without media
  needsImage: boolean
  aspect: AspectRatio
  preset: PlatformPreset
  tone: string
  activeTone: string
}

export const PLATFORMS: Record<PostPlatform, PlatformInfo> = {
  instagram: {
    label: "Instagram",
    captionLimit: 2200,
    hashtagLimit: 30,
    titleLimit: null,
    needsImage: true,
    aspect: "4:5",
    preset: "instagram_portrait",
    tone: "bg-pink-500/12 text-pink-600 dark:text-pink-400",
    activeTone: "border-pink-500/50 bg-pink-500/8 ring-3 ring-pink-500/15",
  },
  youtube: {
    label: "YouTube",
    captionLimit: 5000,
    hashtagLimit: 15,
    titleLimit: 100,
    needsImage: false,
    aspect: "16:9",
    preset: "youtube_thumbnail",
    tone: "bg-red-500/12 text-red-600 dark:text-red-400",
    activeTone: "border-red-500/50 bg-red-500/8 ring-3 ring-red-500/15",
  },
  tiktok: {
    label: "TikTok",
    captionLimit: 2200,
    hashtagLimit: 30,
    titleLimit: null,
    needsImage: false,
    aspect: "9:16",
    preset: "tiktok",
    tone: "bg-zinc-900/10 text-zinc-900 dark:bg-white/10 dark:text-white",
    activeTone: "border-zinc-900/40 bg-zinc-900/5 ring-3 ring-zinc-900/10 dark:border-white/40 dark:bg-white/5 dark:ring-white/10",
  },
}

export const isPostPlatform = (value: string): value is PostPlatform => (POST_PLATFORMS as readonly string[]).includes(value)

// "summer sale, #Launch  day" -> ["#summer", "#sale", "#Launch", "#day"], deduped
export function parseHashtags(text: string) {
  const seen = new Map<string, string>()
  for (const raw of text.split(/[\s,]+/)) {
    const tag = raw.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "")
    if (tag && !seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), `#${tag}`)
  }
  return [...seen.values()].slice(0, 40)
}
