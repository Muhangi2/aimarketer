import "server-only"
import { z } from "zod"
import { completeJSON } from "@/lib/ai/llm"
import { cleanHashtags } from "@/lib/agents/outputs"
import type { DraftFormat } from "@/lib/agents/types"

/*
 * Text generation behind the Creator Agent's write_copy tool: posts, captions, threads, scripts,
 * hashtag sets and content ideas, written to each platform's limits.
 */

const PLATFORM_RULES: Record<string, string> = {
  instagram: "Instagram: caption up to 2200 characters, strong first line before the 'more' cut (~125 chars), 5-15 relevant hashtags, emoji welcome.",
  tiktok: "TikTok: short punchy caption (under 150 characters works best), 3-6 hashtags, hook in the first 2 seconds of any script.",
  x: "X (Twitter): each post at most 280 characters, 0-2 hashtags, threads numbered 1/, 2/...",
  linkedin: "LinkedIn: professional but human, up to 3000 characters, short lines with white space, 3-5 hashtags at the end.",
  facebook: "Facebook: conversational, 1-3 short paragraphs, 0-3 hashtags, a question to spark comments.",
  youtube: "YouTube: title under 70 characters, description with keywords in the first 2 lines, 3-5 hashtags.",
  pinterest: "Pinterest: keyword-rich title under 100 characters and description under 500 characters.",
  threads: "Threads: conversational, under 500 characters, 0-1 hashtag.",
}

const FORMAT_RULES: Record<DraftFormat, string> = {
  post: "A complete, ready-to-publish post.",
  caption: "A caption that goes with an image or video.",
  thread: "A thread: the body holds every part, each on its own line starting with its number (1/, 2/...).",
  carousel: "Carousel slide text: the body lists each slide as 'Slide 1: ...', 'Slide 2: ...' (5-10 slides), then the caption.",
  video_script: "A short video script: hook, beats with on-screen text and voiceover, and a closing call to action.",
  story: "Story frames: 'Frame 1: ...' with short on-screen text and a sticker or poll idea.",
  hashtags: "A hashtag set: the body explains the mix (broad, niche, branded) in one or two lines; put the tags in hashtags.",
  content_idea: "A content idea: the body gives the angle, the format to use and why it fits the audience, in 2-4 lines.",
}

const copySchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().min(1),
        hashtags: z.array(z.string()).default([]),
        call_to_action: z.string().default(""),
      })
    )
    .min(1)
    .max(5),
})

export type CopyRequest = {
  campaignName: string
  format: DraftFormat
  platform: string
  topic: string
  audience?: string | null
  tone?: string | null
  keyPoints?: string | null
  count: number
}

export async function writeCopy(req: CopyRequest) {
  const platform = req.platform.trim().toLowerCase()
  const rules = PLATFORM_RULES[platform] ?? `${req.platform}: follow the platform's usual length and style.`
  const system = `You are a senior social media copywriter for the campaign "${req.campaignName}".
Write ${req.count} distinct variation${req.count > 1 ? "s" : ""}. ${FORMAT_RULES[req.format]}
${rules}
Never invent statistics, prices, dates or claims about real people. Plain text only: no markdown.
Reply with only a JSON object: {"items": [{"title": "short internal label", "body": "...", "hashtags": ["#tag"], "call_to_action": "..."}]}`
  const user = [
    `Topic: ${req.topic}`,
    req.audience ? `Audience: ${req.audience}` : "",
    req.tone ? `Tone: ${req.tone}` : "",
    req.keyPoints ? `Key points to include: ${req.keyPoints}` : "",
  ]
    .filter(Boolean)
    .join("\n")

  const result = await completeJSON(copySchema.refine((value) => value.items.length === req.count, {
    message: `Expected exactly ${req.count} items`,
    path: ["items"],
  }), [
    { role: "system", content: system },
    { role: "user", content: user },
  ], { temperature: 0.8 })
  return result.items.slice(0, req.count).map((item) => ({ ...item, hashtags: cleanHashtags(item.hashtags) }))
}
