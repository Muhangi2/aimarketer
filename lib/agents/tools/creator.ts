import "server-only"
import { z } from "zod"
import { writeCopy } from "@/lib/ai/copywriter"
import { lenientTool } from "@/lib/ai/lenient-tool"
import { DRAFT_FORMATS } from "@/lib/agents/types"
import { uploadFromDesktop } from "./files"
import { httpUrl } from "./links"
import { errorText, memoryOf, pauseGate, setActivity, toolError, type Session } from "./session"

/*
 * Creator Agent text tools: write_copy (posts, captions, hashtags, ideas) and save_content_draft
 * (to the content_draft table). The image tools are in ./images.
 */

export function writeCopyTool(session: Session) {
  return lenientTool({
    errorFunction: toolError,
    name: "write_copy",
    needsApproval: pauseGate(session),
    description:
      "Draft social media text in 1-5 variations: post, caption, thread, carousel, video_script, story, hashtags (a hashtag set) or content_idea, for one platform. Returns the variations; refine the best and save it with save_content_draft.",
    parameters: z.object({
      format: z.enum(DRAFT_FORMATS).catch("post"),
      platform: z.string().default("instagram").describe("instagram, tiktok, x, linkedin, facebook, youtube, pinterest or threads"),
      topic: z.string().min(1).describe("What the piece is about, with the angle"),
      audience: z.string().nullable().default(null),
      tone: z.string().nullable().default(null),
      key_points: z.string().nullable().default(null).describe("Facts, offers, links or research findings to include"),
      count: z.number().int().min(1).max(5).catch(3),
    }),
    execute: async (input) => {
      try {
        await setActivity(session, `Writing ${input.format.replace("_", " ")} for ${input.platform}`)
        const items = await writeCopy({
          campaignName: session.campaignName,
          format: input.format,
          platform: input.platform,
          topic: input.topic,
          audience: input.audience,
          tone: input.tone,
          keyPoints: input.key_points,
          count: input.count,
        })
        return items
          .map((item, i) => `Variation ${i + 1}: ${item.title}\n${item.body}${item.hashtags.length ? `\nHashtags: ${item.hashtags.join(" ")}` : ""}${item.call_to_action ? `\nCall to action: ${item.call_to_action}` : ""}`)
          .join("\n\n")
      } catch (error) {
        return `Writing failed: ${errorText(error)}. Write it yourself instead.`
      }
    },
  })
}

export function saveDraftTool(session: Session) {
  return lenientTool({
    errorFunction: toolError,
    name: "save_content_draft",
    needsApproval: pauseGate(session),
    description: "Save one finished post, caption, thread, carousel, script, story, hashtag set or content idea as a draft in the database, with its images.",
    parameters: z.object({
      platform: z.string().default("instagram"),
      format: z.enum(DRAFT_FORMATS).catch("post"),
      title: z.string().min(1).describe("Short label, e.g. 'Launch teaser - carousel'"),
      body: z.string().min(1).describe("The full text, exactly as it should be posted"),
      hashtags: z.array(z.string()).default([]),
      call_to_action: z.string().nullable().default(null),
      image_urls: z.array(z.string()).default([]).describe("Image URLs from generate_image or edit_image"),
      notes: z.string().nullable().default(null).describe("Posting notes, e.g. best time, alt text, music"),
    }),
    execute: async (input, ctx) => {
      const memory = memoryOf(ctx)
      const imageUrls: string[] = []
      for (const ref of input.image_urls.slice(0, 20)) {
        const url = httpUrl(ref)
        // A desktop path the agent forgot to upload
        imageUrls.push(url ?? (await uploadFromDesktop(session, memory, ref, "uploaded")))
      }
      const draft = await session.outputs.addDraft({
        requestId: session.task.requestId,
        taskId: session.task.id,
        platform: input.platform,
        format: input.format,
        title: input.title,
        body: input.body,
        hashtags: input.hashtags,
        callToAction: input.call_to_action,
        imageUrls,
        notes: input.notes,
      })
      memory.drafts = [...(memory.drafts ?? []), draft.id]
      await setActivity(session, `Saved a draft: ${draft.title.slice(0, 60)}`)
      return `Saved draft ${memory.drafts.length} (${draft.format} for ${draft.platform}${imageUrls.length ? `, ${imageUrls.length} image${imageUrls.length === 1 ? "" : "s"}` : ""}).`
    },
  })
}
