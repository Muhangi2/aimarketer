"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { PLATFORMS, parseHashtags } from "@/lib/posts/platforms"
import { POST_COLUMNS, toPost } from "@/lib/posts/store"
import { isValidTimeZone, zonedTimeToUtc } from "@/lib/posts/time"
import { isEditablePost, savePostSchema, type PostRecord, type SavePostInput } from "@/lib/posts/types"

type Result = { ok: true; post: PostRecord } | { ok: false; error: string }

// Media must come from this app's storage (ImageKit or InsForge), not any URL a client sends
function ownedMediaUrl(url: string) {
  const roots = [process.env.IMAGEKIT_URL_ENDPOINT, process.env.NEXT_PUBLIC_INSFORGE_URL]
    .filter(Boolean)
    .map((r) => `${r!.replace(/\/+$/, "")}/`)
  return roots.some((root) => url.startsWith(root))
}

/**
 * Saves a post: scheduled (pending publish) or as a draft. With postId it updates that post
 * (edit or reschedule) as long as it hasn't been published. Publishing comes later.
 */
export async function savePost(input: SavePostInput): Promise<Result> {
  const parsed = savePostSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Some details are invalid." }
  const post = parsed.data

  const insforge = await createInsForgeServerClient()
  const { data: auth } = await insforge.auth.getCurrentUser()
  const user = auth?.user
  if (!user) redirect("/sign-in")

  // RLS only returns the caller's own campaigns
  const { data: campaign } = await insforge.database.from("campaign").select("id").eq("id", post.campaignId).maybeSingle()
  if (!campaign) return { ok: false, error: "Campaign not found." }

  if (post.media.some((m) => !ownedMediaUrl(m.url))) return { ok: false, error: "Upload or generate images here before saving." }

  const hashtags = parseHashtags(post.hashtags.join(" "))
  for (const key of post.platforms) {
    const info = PLATFORMS[key]
    if (post.caption.length > info.captionLimit) return { ok: false, error: `${info.label} captions are limited to ${info.captionLimit} characters.` }
    if (hashtags.length > info.hashtagLimit) return { ok: false, error: `${info.label} allows up to ${info.hashtagLimit} hashtags.` }
    if (info.titleLimit && post.title.length > info.titleLimit) return { ok: false, error: `${info.label} titles are limited to ${info.titleLimit} characters.` }
  }

  let scheduledAt: string | null = null
  let timezone: string | null = null
  if (post.intent === "schedule") {
    if (post.platforms.some((p) => PLATFORMS[p].needsImage) && post.media.length === 0) {
      return { ok: false, error: "Instagram posts need at least one image." }
    }
    if (!post.date || !post.time || !post.timezone) return { ok: false, error: "Pick a date, time and time zone." }
    if (!isValidTimeZone(post.timezone)) return { ok: false, error: "Pick a valid time zone." }
    const at = zonedTimeToUtc(post.date, post.time, post.timezone)
    if (!at) return { ok: false, error: "Pick a valid date and time." }
    // A minute of slack for the time it takes to submit
    if (at.getTime() < Date.now() - 60_000) return { ok: false, error: "Pick a time in the future." }
    scheduledAt = at.toISOString()
    timezone = post.timezone
  }

  const fields = {
    platform: post.platforms[0],
    platforms: post.platforms,
    title: post.title,
    body: post.caption,
    hashtags,
    image_urls: post.media.map((m) => m.url),
    media: post.media,
    status: post.intent === "schedule" ? "scheduled" : "draft",
    scheduled_at: scheduledAt,
    timezone,
  }

  let data: unknown
  let error: unknown
  if (post.postId) {
    // Editing or rescheduling: only a post that hasn't gone out yet
    const { data: current } = await insforge.database
      .from("content_draft")
      .select("status")
      .eq("id", post.postId)
      .eq("campaign_id", post.campaignId)
      .maybeSingle()
    if (!current) return { ok: false, error: "Post not found." }
    if (!isEditablePost(current as { status: PostRecord["status"] })) {
      return { ok: false, error: "This post was already published, so it can't be changed." }
    }
    ;({ data, error } = await insforge.database
      .from("content_draft")
      .update(fields)
      .eq("id", post.postId)
      .eq("campaign_id", post.campaignId)
      .neq("status", "published")
      .select(POST_COLUMNS)
      .maybeSingle())
    // Published between the check and the update
    if (!error && !data) return { ok: false, error: "This post was already published, so it can't be changed." }
  } else {
    ;({ data, error } = await insforge.database
      .from("content_draft")
      .insert([{ ...fields, campaign_id: post.campaignId, user_id: user.id, source: "manual", format: "post" }])
      .select(POST_COLUMNS)
      .single())
  }

  if (error || !data) {
    console.error("Could not save the post", error)
    return { ok: false, error: "Couldn't save the post. Please try again." }
  }

  revalidatePath("/dashboard/posts")
  revalidatePath("/dashboard")
  return { ok: true, post: toPost(data as Record<string, unknown>) }
}

export async function deletePost(postId: string): Promise<{ ok: boolean; error?: string }> {
  const insforge = await createInsForgeServerClient()
  const { data: auth } = await insforge.auth.getCurrentUser()
  if (!auth?.user) redirect("/sign-in")

  // RLS limits the delete to the caller's own posts
  const { error } = await insforge.database.from("content_draft").delete().eq("id", postId)
  if (error) {
    console.error("Could not delete the post", error)
    return { ok: false, error: "Couldn't delete the post." }
  }
  revalidatePath("/dashboard/posts")
  revalidatePath("/dashboard")
  return { ok: true }
}
