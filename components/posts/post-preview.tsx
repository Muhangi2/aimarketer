"use client"

import { useState } from "react"
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImageIcon,
  MessageCircle,
  MoreHorizontal,
  Music2,
  Plus,
  Send,
  Share2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react"
import { cn } from "cn"
import { isVideoUrl, type PostPlatform } from "@/lib/posts/platforms"

export type PreviewData = {
  title: string
  caption: string
  hashtags: string[]
  images: string[]
  accountName: string
  accountAvatar: React.ReactNode
}

const handle = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "your_brand"

// Images as pictures, videos playing silently on a loop like the feeds do
function MediaView({ url, className }: { url: string; className?: string }) {
  if (isVideoUrl(url)) return <video src={url} className={className} autoPlay muted loop playsInline />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className={className} />
}

function EmptyMedia({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 text-xs", dark ? "bg-zinc-800 text-zinc-400" : "bg-muted text-muted-foreground", className)}>
      <ImageIcon className="size-8 opacity-60" />
      Your image or video appears here
    </div>
  )
}

// Caption with hashtags highlighted like the apps do
function RichCaption({ caption, hashtags, tagClass }: { caption: string; hashtags: string[]; tagClass: string }) {
  return (
    <>
      <span className="whitespace-pre-line">{caption}</span>
      {hashtags.length > 0 && (
        <>
          {caption ? " " : ""}
          {hashtags.map((tag) => (
            <span key={tag} className={tagClass}>
              {tag}{" "}
            </span>
          ))}
        </>
      )}
    </>
  )
}

function InstagramPreview({ data }: { data: PreviewData }) {
  const [slide, setSlide] = useState(0)
  const index = Math.min(slide, Math.max(0, data.images.length - 1))
  const [expanded, setExpanded] = useState(false)
  const name = handle(data.accountName)
  return (
    <div className="mx-auto w-full max-w-[380px] overflow-hidden rounded-2xl border bg-white text-[13px] text-zinc-900 shadow-xl shadow-black/5 dark:border-zinc-800 dark:bg-black dark:text-zinc-50">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="rounded-full bg-linear-to-tr from-amber-400 via-pink-500 to-purple-600 p-[2px]">
          <span className="block rounded-full bg-white p-[2px] dark:bg-black">{data.accountAvatar}</span>
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-[11px] text-zinc-500">Sponsored</p>
        </div>
        <MoreHorizontal className="size-5" />
      </div>
      <div className="relative aspect-4/5 bg-zinc-100 dark:bg-zinc-900">
        {data.images.length ? (
          <MediaView key={data.images[index]} url={data.images[index]} className="size-full object-cover animate-in fade-in duration-300" />
        ) : (
          <EmptyMedia className="size-full" />
        )}
        {data.images.length > 1 && (
          <>
            <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
              {index + 1}/{data.images.length}
            </span>
            {index > 0 && (
              <button type="button" onClick={() => setSlide(index - 1)} className="absolute top-1/2 left-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow">
                <ChevronLeft className="size-4" />
              </button>
            )}
            {index < data.images.length - 1 && (
              <button type="button" onClick={() => setSlide(index + 1)} className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-900 shadow">
                <ChevronRight className="size-4" />
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-4 px-3 pt-3">
        <Heart className="size-6" />
        <MessageCircle className="size-6 -scale-x-100" />
        <Send className="size-6" />
        {data.images.length > 1 && (
          <div className="mx-auto flex gap-1">
            {data.images.map((url, i) => (
              <span key={url} className={cn("size-1.5 rounded-full", i === index ? "bg-sky-500" : "bg-zinc-300 dark:bg-zinc-600")} />
            ))}
          </div>
        )}
        <Bookmark className="ml-auto size-6" />
      </div>
      <div className="space-y-1 px-3 pt-2 pb-4">
        <p className="font-semibold">1,284 likes</p>
        <p className={cn(!expanded && "line-clamp-3")}>
          <span className="mr-1 font-semibold">{name}</span>
          <RichCaption caption={data.caption || "Your caption…"} hashtags={data.hashtags} tagClass="text-sky-800 dark:text-sky-300" />
        </p>
        {(data.caption.length > 120 || data.hashtags.length > 6) && (
          <button type="button" onClick={() => setExpanded(!expanded)} className="text-zinc-500">
            {expanded ? "less" : "more"}
          </button>
        )}
        <p className="pt-1 text-[10px] tracking-wide text-zinc-500 uppercase">Just now</p>
      </div>
    </div>
  )
}

function TikTokPreview({ data }: { data: PreviewData }) {
  const name = handle(data.accountName)
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2.2rem] border-[6px] border-zinc-900 bg-black shadow-2xl shadow-black/20">
      <div className="relative aspect-9/16 overflow-hidden rounded-[1.75rem] text-white">
        {data.images[0] ? (
          <MediaView key={data.images[0]} url={data.images[0]} className="absolute inset-0 size-full object-cover animate-in fade-in duration-300" />
        ) : (
          <EmptyMedia dark className="absolute inset-0" />
        )}
        <div className="absolute inset-x-0 top-0 flex justify-center gap-4 bg-linear-to-b from-black/50 to-transparent pt-4 pb-8 text-[13px] font-semibold">
          <span className="text-white/60">Following</span>
          <span className="border-b-2 border-white pb-1">For You</span>
        </div>
        {/* Right rail */}
        <div className="absolute right-2 bottom-24 flex flex-col items-center gap-4 text-[10px] font-semibold">
          <div className="relative">
            <span className="block overflow-hidden rounded-full border-2 border-white">{data.accountAvatar}</span>
            <span className="absolute -bottom-2 left-1/2 flex size-4 -translate-x-1/2 items-center justify-center rounded-full bg-[#fe2c55]">
              <Plus className="size-3" />
            </span>
          </div>
          {[
            [Heart, "24.1K"],
            [MessageCircle, "312"],
            [Bookmark, "1,045"],
            [Share2, "Share"],
          ].map(([Icon, label]) => {
            const I = Icon as typeof Heart
            return (
              <span key={label as string} className="flex flex-col items-center gap-0.5 drop-shadow">
                <I className="size-7 fill-white" />
                {label as string}
              </span>
            )
          })}
        </div>
        <div className="absolute inset-x-0 bottom-0 space-y-1.5 bg-linear-to-t from-black/80 via-black/40 to-transparent p-3 pt-16 pr-16 text-[12px] drop-shadow">
          <p className="text-[13px] font-semibold">@{name}</p>
          <p className="line-clamp-3">
            <RichCaption caption={data.caption || "Your caption…"} hashtags={data.hashtags} tagClass="font-semibold" />
          </p>
          <p className="flex items-center gap-1.5 text-[11px]">
            <Music2 className="size-3" />
            <span className="truncate">Original sound · {data.accountName}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function YouTubePreview({ data }: { data: PreviewData }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mx-auto w-full max-w-[460px] overflow-hidden rounded-2xl border bg-white text-zinc-900 shadow-xl shadow-black/5 dark:border-zinc-800 dark:bg-[#0f0f0f] dark:text-zinc-50">
      <div className="relative aspect-video bg-zinc-100 dark:bg-zinc-900">
        {data.images[0] ? (
          <MediaView key={data.images[0]} url={data.images[0]} className="size-full object-cover animate-in fade-in duration-300" />
        ) : (
          <EmptyMedia className="size-full" />
        )}
        <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1 text-[11px] font-medium text-white">0:45</span>
      </div>
      <div className="space-y-3 p-3">
        <p className="line-clamp-2 text-[15px] leading-snug font-semibold">{data.title || "Your video title"}</p>
        <div className="flex items-center gap-2.5">
          {data.accountAvatar}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold">{data.accountName}</p>
            <p className="text-[11px] text-zinc-500">12.4K subscribers</p>
          </div>
          <span className="rounded-full bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white dark:bg-white dark:text-zinc-900">Subscribe</span>
        </div>
        <div className="flex gap-2 text-[12px] font-semibold">
          <span className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 dark:bg-zinc-800">
            <ThumbsUp className="size-4" /> 1.2K
            <span className="h-4 w-px bg-zinc-300 dark:bg-zinc-600" />
            <ThumbsDown className="size-4" />
          </span>
          <span className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 dark:bg-zinc-800">
            <Share2 className="size-4" /> Share
          </span>
        </div>
        <button type="button" onClick={() => setExpanded(!expanded)} className="block w-full rounded-xl bg-zinc-100 p-3 text-left text-[12px] dark:bg-zinc-800">
          <p className="font-semibold">1,024 views · Just now</p>
          <p className={cn("mt-1", !expanded && "line-clamp-3")}>
            <RichCaption caption={data.caption || "Your description…"} hashtags={data.hashtags} tagClass="text-sky-700 dark:text-sky-400" />
          </p>
          <span className="mt-1 block font-semibold">{expanded ? "Show less" : "…more"}</span>
        </button>
      </div>
    </div>
  )
}

export function PostPreview({ platform, data }: { platform: PostPlatform; data: PreviewData }) {
  if (platform === "instagram") return <InstagramPreview data={data} />
  if (platform === "tiktok") return <TikTokPreview data={data} />
  return <YouTubePreview data={data} />
}
