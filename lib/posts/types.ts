import { z } from "zod"
import { IMAGE_EDIT_OPERATIONS, type ImageEditOperation } from "@/lib/imagekit/edits"
import { POST_PLATFORMS } from "@/lib/posts/platforms"

/* Posts shown on the Posts page: manual posts and the Creator Agent's drafts (content_draft). */

export const POST_STATUSES = ["draft", "approved", "pending", "scheduled", "published", "failed", "archived"] as const
export type PostStatus = (typeof POST_STATUSES)[number]

export type PostMedia = {
  url: string
  // The image before any edits (uploaded or generated)
  originalUrl: string | null
  edits: ImageEditOperation[]
  origin: "upload" | "generated" | "agent"
}

export type PostRecord = {
  id: string
  source: "agent" | "manual"
  title: string
  body: string
  hashtags: string[]
  platforms: string[]
  format: string
  media: PostMedia[]
  status: PostStatus
  scheduledAt: string | null
  timezone: string | null
  createdAt: string
  updatedAt: string
}

// Statuses whose post can still be edited and (re)scheduled: anything not yet published
const LOCKED_STATUSES: PostStatus[] = ["published", "archived"]

/** Whether the post hasn't gone out yet, so the user can still change or reschedule it. */
export const isEditablePost = (post: Pick<PostRecord, "status">) => !LOCKED_STATUSES.includes(post.status)

export const postMediaSchema = z.object({
  url: z.string().url(),
  originalUrl: z.string().url().nullable().default(null),
  edits: z.array(z.enum(IMAGE_EDIT_OPERATIONS)).max(30).default([]),
  origin: z.enum(["upload", "generated", "agent"]).default("upload"),
})

export const savePostSchema = z.object({
  campaignId: z.string().uuid(),
  // Set when editing an existing post (it must not be published yet); null creates a new one
  postId: z.string().uuid().nullable().default(null),
  // "schedule" saves a scheduled (pending publish) post; "draft" saves it for later
  intent: z.enum(["schedule", "draft"]),
  title: z.string().trim().min(1, "Add a title.").max(300),
  caption: z.string().trim().max(5000).default(""),
  hashtags: z.array(z.string()).max(40).default([]),
  platforms: z.array(z.enum(POST_PLATFORMS)).min(1, "Pick at least one platform.").max(POST_PLATFORMS.length),
  media: z.array(postMediaSchema).max(10).default([]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  timezone: z.string().max(80).nullable().default(null),
})
export type SavePostInput = z.input<typeof savePostSchema>
