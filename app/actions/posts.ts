"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { getPublishingSetup } from "@/lib/posts/accounts"
import { encodeTarget, parseTarget } from "@/lib/posts/targets"
import { postPublishEvent, inngest } from "@/lib/inngest/client"
import { PLATFORMS, mediaIssue, parseHashtags } from "@/lib/posts/platforms"
import { POST_COLUMNS, toPost } from "@/lib/posts/store"
import { isValidTimeZone, zonedTimeToUtc } from "@/lib/posts/time"
import { z } from "zod"
import { getPost } from "@/lib/posts/store"
import { isPostPlatform } from "@/lib/posts/platforms"
import { cancelOnZernio, heldOnZernio, placeOnZernio, savePublishResults } from "@/lib/posts/publish"
import { isEditablePost, savePostSchema, type PostRecord, type PublishResult, type SavePostInput } from "@/lib/posts/types"

// On failure, `post` is set when the post did change (Zernio refused it, so it's now a draft)
type Result = { ok: true; post: PostRecord } | { ok: false; error: string; post?: PostRecord }

const CANCEL_FAILED = "Couldn't reach Zernio to cancel the scheduled post, so nothing was changed. Please try again."

// Publish events are sent when a post is scheduled if it's due within this long; later ones are
// picked up by the 15-minute sweep (Inngest limits how long a function can sleep)
const SEND_NOW_WITHIN_MS = 6 * 24 * 60 * 60 * 1000

// Media must come from this app's storage (ImageKit or InsForge), not any URL a client sends
function ownedMediaUrl(url: string) {
  const roots = [process.env.IMAGEKIT_URL_ENDPOINT, process.env.NEXT_PUBLIC_INSFORGE_URL]
    .filter(Boolean)
    .map((r) => `${r!.replace(/\/+$/, "")}/`)
  return roots.some((root) => url.startsWith(root))
}

/** Queues the publish job. If Inngest can't be reached, the 15-minute sweep sends it later. */
async function queuePublish(post: PostRecord, userId: string) {
  if (post.status !== "scheduled" || !post.scheduledAt || Date.parse(post.scheduledAt) - Date.now() >= SEND_NOW_WITHIN_MS) return
  await inngest
    .send(postPublishEvent({ postId: post.id, userId, scheduledAt: post.scheduledAt }))
    .catch((e) => console.error("Could not queue the post for publishing", e))
}

/**
 * After a post is saved as scheduled: hands it to Zernio (or updates Zernio's copy) and queues
 * the publish job. Returns the error to show if Zernio refused it.
 */
async function schedule(saved: PostRecord, userId: string): Promise<Result> {
  let post = saved
  try {
    const placement = await placeOnZernio(saved, userId)
    post = placement.post
    if (placement.refused) return { ok: false, error: placement.refused, post }
  } catch (error) {
    // The publish job sends it when it's due instead
    console.error("Could not hand the post to Zernio", error)
  }
  await queuePublish(post, userId)
  return { ok: true, post }
}

/** Cancels Zernio's copies before a post stops being scheduled. False if Zernio couldn't be reached. */
async function cancelScheduled(userId: string, results: PublishResult[]) {
  try {
    await cancelOnZernio(userId, results)
    return true
  } catch (error) {
    console.error("Could not cancel the post on Zernio", error)
    return false
  }
}

function revalidatePosts() {
  revalidatePath("/dashboard/posts")
  revalidatePath("/dashboard/calendar")
  revalidatePath("/dashboard")
}

/**
 * Saves a post: scheduled (pending publish) or as a draft. With postId it updates that post
 * (edit or reschedule) as long as it isn't going out yet. Scheduled posts are handed to Zernio
 * right away (placeOnZernio); Blotato posts are sent by the Inngest publish job when due.
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

  // Images or a single video, whatever the platforms
  const layoutIssue = mediaIssue([], post.media)
  if (layoutIssue) return { ok: false, error: layoutIssue }

  // Each platform posts to one of the user's accounts on it (Zernio's first, then Blotato's)
  const setup = await getPublishingSetup(insforge)
  const targetAccounts: Record<string, string> = {}
  for (const platform of post.platforms) {
    const accounts = setup.accounts.filter((a) => a.platform === platform)
    const requested = post.targetAccounts[platform]
    const wanted = requested ? encodeTarget(parseTarget(requested).provider, parseTarget(requested).accountId) : null
    const account = accounts.find((a) => a.id === wanted) ?? accounts[0]
    if (account) targetAccounts[platform] = account.id
  }

  let scheduledAt: string | null = null
  let timezone: string | null = null
  if (post.intent === "schedule") {
    const missing = post.platforms.find((p) => !targetAccounts[p])
    if (missing) return { ok: false, error: `Connect a ${PLATFORMS[missing].label} account on the Accounts page first.` }
    if (setup.blotatoInvalid && Object.values(targetAccounts).some((t) => t.startsWith("blotato:"))) {
      return { ok: false, error: "Blotato rejected your API key. Add a new one in Settings → Integrations, or pick another account." }
    }
    const issue = mediaIssue(post.platforms, post.media)
    if (issue) return { ok: false, error: issue }
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
    target_accounts: targetAccounts,
  }

  let data: unknown
  let error: unknown
  let wasHeld = false
  if (post.postId) {
    // Editing or rescheduling: only a post that hasn't gone out yet
    const { data: current } = await insforge.database
      .from("content_draft")
      .select("status, publish_results")
      .eq("id", post.postId)
      .eq("campaign_id", post.campaignId)
      .maybeSingle()
    if (!current) return { ok: false, error: "Post not found." }
    const { status, publish_results } = current as { status: PostRecord["status"]; publish_results: unknown }
    if (!isEditablePost({ status })) {
      return { ok: false, error: "This post is being published or was already published, so it can't be changed." }
    }
    // Saved as a draft: Zernio mustn't publish it anymore
    if (post.intent !== "schedule" && Array.isArray(publish_results) && heldOnZernio(publish_results as PublishResult[]).length > 0) {
      if (!(await cancelScheduled(user.id, publish_results as PublishResult[]))) return { ok: false, error: CANCEL_FAILED }
      wasHeld = true
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
    if (!error && !data) return { ok: false, error: "This post is being published or was already published, so it can't be changed." }
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

  let saved = toPost(data as Record<string, unknown>)
  // Zernio's cancelled copies; users can't write this column, so the server clears it
  if (wasHeld) {
    await savePublishResults(saved.id, user.id, []).catch((e) => console.error("Could not clear the Zernio posts", e))
    saved = { ...saved, publishResults: [] }
  }
  const result = await schedule(saved, user.id)
  revalidatePosts()
  return result
}

export async function deletePost(postId: string): Promise<{ ok: boolean; error?: string }> {
  const insforge = await createInsForgeServerClient()
  const { data: auth } = await insforge.auth.getCurrentUser()
  if (!auth?.user) redirect("/sign-in")

  // RLS limits both to the caller's own posts
  const { data: current } = await insforge.database.from("content_draft").select("publish_results").eq("id", postId).maybeSingle()
  const results = (current as { publish_results?: unknown } | null)?.publish_results
  // Cancel Zernio's copy first, so a deleted post can't still go out
  if (Array.isArray(results) && !(await cancelScheduled(auth.user.id, results as PublishResult[]))) return { ok: false, error: CANCEL_FAILED }

  const { error } = await insforge.database.from("content_draft").delete().eq("id", postId)
  if (error) {
    console.error("Could not delete the post", error)
    return { ok: false, error: "Couldn't delete the post." }
  }
  revalidatePosts()
  return { ok: true }
}

const rescheduleSchema = z.object({
  campaignId: z.string().uuid(),
  postId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().max(80),
})

/**
 * Moves a post to a new date and time (calendar drag and drop). A draft dropped on the calendar
 * gets scheduled, after the same checks as scheduling it in the composer.
 */
export async function reschedulePost(input: z.input<typeof rescheduleSchema>): Promise<Result> {
  const parsed = rescheduleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Pick a valid date and time." }
  const { campaignId, postId, date, time, timezone } = parsed.data

  const insforge = await createInsForgeServerClient()
  const { data: auth } = await insforge.auth.getCurrentUser()
  const user = auth?.user
  if (!user) redirect("/sign-in")

  // RLS only returns the caller's own posts
  const post = await getPost(insforge, campaignId, postId)
  if (!post) return { ok: false, error: "Post not found." }
  if (!isEditablePost(post)) return { ok: false, error: "This post is being published or was already published, so it can't be moved." }

  if (!isValidTimeZone(timezone)) return { ok: false, error: "Pick a valid time zone." }
  const at = zonedTimeToUtc(date, time, timezone)
  if (!at) return { ok: false, error: "Pick a valid date and time." }
  if (at.getTime() < Date.now() + 60_000) return { ok: false, error: "Pick a time in the future." }

  // The same checks as scheduling from the composer
  const platforms = post.platforms.filter(isPostPlatform)
  if (platforms.length === 0) return { ok: false, error: "Pick a platform for this post first." }
  if (!post.title.trim()) return { ok: false, error: "Add a title to this post first." }
  const issue = mediaIssue(platforms, post.media)
  if (issue) return { ok: false, error: issue }
  const setup = await getPublishingSetup(insforge)
  const targetAccounts: Record<string, string> = {}
  for (const platform of platforms) {
    const accounts = setup.accounts.filter((a) => a.platform === platform)
    const saved = post.targetAccounts[platform]
    const wanted = saved ? encodeTarget(parseTarget(saved).provider, parseTarget(saved).accountId) : null
    const account = accounts.find((a) => a.id === wanted) ?? accounts[0]
    if (!account) return { ok: false, error: `Connect a ${PLATFORMS[platform].label} account on the Accounts page first.` }
    targetAccounts[platform] = account.id
  }

  const { data, error } = await insforge.database
    .from("content_draft")
    .update({ status: "scheduled", scheduled_at: at.toISOString(), timezone, target_accounts: targetAccounts })
    .eq("id", postId)
    .eq("campaign_id", campaignId)
    .not("status", "in", "(publishing,published,archived)")
    .select(POST_COLUMNS)
    .maybeSingle()
  if (error) {
    console.error("Could not reschedule the post", error)
    return { ok: false, error: "Couldn't move the post. Please try again." }
  }
  if (!data) return { ok: false, error: "This post is being published or was already published, so it can't be moved." }

  const result = await schedule(toPost(data as Record<string, unknown>), user.id)
  revalidatePosts()
  return result
}
