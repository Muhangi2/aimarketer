import "server-only"
import { getInsForgeAdmin } from "@/lib/insforge/admin"
import { postPublishEvent, inngest } from "@/lib/inngest/client"
import { getPublishingSetupFor } from "@/lib/posts/accounts"
import { PLATFORMS, isPostPlatform, mediaIssue, parseHashtags, type PostPlatform } from "@/lib/posts/platforms"
import { placeOnZernio } from "@/lib/posts/publish"
import { POST_COLUMNS, toPost } from "@/lib/posts/store"
import { isValidTimeZone, zonedTimeToUtc } from "@/lib/posts/time"
import type { PostRecord } from "@/lib/posts/types"

/*
 * Scheduling a saved draft for the Scheduler Agent: the same checks and the same publishing path
 * as the Posts page (app/actions/posts.ts savePost), without a signed-in user, so every query
 * filters by user_id and campaign_id itself.
 */

type Row = Record<string, unknown>
const db = () => getInsForgeAdmin().database

// Publish events go out now if the post is due within this long; later ones are sent by the sweep
const SEND_NOW_WITHIN_MS = 6 * 24 * 60 * 60 * 1000

/** Drafts that can be scheduled: this request's first, then the campaign's newest. */
export async function listSchedulableDrafts(userId: string, campaignId: string, requestId: string | null) {
  const { data, error } = await db()
    .from("content_draft")
    .select(`${POST_COLUMNS}, request_id`)
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .in("status", ["draft", "approved"])
    .neq("format", "hashtags")
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) throw new Error(`Could not load drafts: ${error.message}`)
  const rows = (data ?? []) as Row[]
  const mine = rows.filter((r) => requestId && r.request_id === requestId)
  const rest = rows.filter((r) => !(requestId && r.request_id === requestId))
  return { forRequest: mine.map(toPost), others: rest.map(toPost) }
}

export type ScheduleResult = { ok: true; post: PostRecord; warning: string | null } | { ok: false; error: string }

/** Schedules one of the user's drafts to publish at date + time in timeZone. */
export async function scheduleDraft(
  userId: string,
  campaignId: string,
  input: { postId: string; platforms: string[]; date: string; time: string; timeZone: string }
): Promise<ScheduleResult> {
  const { data: row, error: loadError } = await db().from("content_draft").select(POST_COLUMNS).eq("id", input.postId).eq("user_id", userId).eq("campaign_id", campaignId).maybeSingle()
  if (loadError) return { ok: false, error: `Could not load the draft: ${loadError.message}` }
  if (!row) return { ok: false, error: "No draft with that id in this campaign. Call list_drafts for the right id." }
  const draft = toPost(row as Row)
  if (!["draft", "approved"].includes(draft.status)) return { ok: false, error: `That post is already ${draft.status}, so it can't be scheduled again.` }

  const requested = (input.platforms.length ? input.platforms : draft.platforms).map((p) => p.toLowerCase().trim())
  const platforms = [...new Set(requested.filter(isPostPlatform))] as PostPlatform[]
  if (platforms.length === 0) return { ok: false, error: `Posts can go to Instagram, TikTok or YouTube, not ${requested.join(", ") || "no platform"}.` }

  const hashtags = parseHashtags(draft.hashtags.join(" "))
  for (const key of platforms) {
    const info = PLATFORMS[key]
    if (draft.body.length > info.captionLimit) return { ok: false, error: `${info.label} captions are limited to ${info.captionLimit} characters; this one has ${draft.body.length}.` }
    if (hashtags.length > info.hashtagLimit) return { ok: false, error: `${info.label} allows up to ${info.hashtagLimit} hashtags; this draft has ${hashtags.length}.` }
  }
  const issue = mediaIssue(platforms, draft.media)
  if (issue) return { ok: false, error: issue }

  const setup = await getPublishingSetupFor(userId)
  const targetAccounts: Record<string, string> = {}
  for (const platform of platforms) {
    const account = setup.accounts.find((a) => a.platform === platform)
    if (!account) return { ok: false, error: `No ${PLATFORMS[platform].label} account is connected. The user can connect one on the Accounts page.` }
    targetAccounts[platform] = account.id
  }

  if (!isValidTimeZone(input.timeZone)) return { ok: false, error: `"${input.timeZone}" isn't a valid time zone. Use one like Africa/Kampala or America/New_York.` }
  const at = zonedTimeToUtc(input.date, input.time, input.timeZone)
  if (!at) return { ok: false, error: "Use date YYYY-MM-DD and time HH:MM (24-hour)." }
  if (at.getTime() < Date.now() - 60_000) return { ok: false, error: `${input.date} ${input.time} (${input.timeZone}) is in the past. Pick a future time.` }

  const { data, error } = await db()
    .from("content_draft")
    .update({
      platform: platforms[0],
      platforms,
      hashtags,
      media: draft.media,
      image_urls: draft.media.map((m) => m.url),
      status: "scheduled",
      scheduled_at: at.toISOString(),
      timezone: input.timeZone,
      target_accounts: targetAccounts,
    })
    .eq("id", draft.id)
    .eq("user_id", userId)
    .in("status", ["draft", "approved"])
    .select(POST_COLUMNS)
    .maybeSingle()
  if (error) return { ok: false, error: `Could not schedule the post: ${error.message}` }
  if (!data) return { ok: false, error: "The post changed while scheduling it. Call list_drafts and try again." }

  let post = toPost(data as Row)
  let warning: string | null = null
  try {
    // Zernio holds it and publishes on time by itself
    const placement = await placeOnZernio(post, userId)
    post = placement.post
    if (placement.refused) return { ok: false, error: `Zernio refused the post: ${placement.refused}. It was saved as a draft instead.` }
  } catch (e) {
    console.error("Could not hand the post to Zernio", e)
    warning = "Zernio couldn't be reached just now; the publish job will send it when it's due."
  }
  if (post.status === "scheduled" && post.scheduledAt && Date.parse(post.scheduledAt) - Date.now() < SEND_NOW_WITHIN_MS) {
    await inngest.send(postPublishEvent({ postId: post.id, userId, scheduledAt: post.scheduledAt })).catch((e) => console.error("Could not queue the post for publishing", e))
  }
  return { ok: true, post, warning }
}
