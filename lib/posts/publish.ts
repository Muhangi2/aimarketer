import "server-only"
import { createHash } from "node:crypto"
import { getInsForgeAdmin } from "@/lib/insforge/admin"
import { BlotatoError, type BlotatoPostInput } from "@/lib/blotato/client"
import { blotatoFor, markBlotatoInvalid } from "@/lib/blotato/store"
import { getPublishingSetupFor } from "@/lib/posts/accounts"
import { PLATFORMS, isPostPlatform, mediaIssue, type PostPlatform } from "@/lib/posts/platforms"
import { POST_COLUMNS, toPost } from "@/lib/posts/store"
import { parseTarget } from "@/lib/posts/targets"
import type { PostRecord, PublishResult } from "@/lib/posts/types"
import { ZernioError } from "@/lib/zernio/client"
import { zernioFor } from "@/lib/zernio/store"

/*
 * Publishing scheduled posts through the user's accounts: Zernio first, or their own Blotato
 * account. Runs without a signed-in user, so every admin query filters by user_id itself.
 *
 * Zernio posts are handed to Zernio as soon as they're scheduled (placeOnZernio), so Zernio
 * publishes them on time even if this app is down; editing, moving or deleting the post changes
 * or cancels Zernio's copy. The Inngest publish job (lib/inngest/functions.ts) then follows them
 * up, and sends anything Zernio doesn't hold yet (Blotato posts, or Zernio being unreachable when
 * the post was scheduled) when it's due.
 */

type Row = Record<string, unknown>

/** One platform's request, ready to send. */
export type Submission = BlotatoPostInput & {
  provider: "zernio" | "blotato"
  // Zernio needs these too; Blotato builds them from text/target
  zernioSettings: Row
  mediaKinds: ("image" | "video")[]
  idempotencyKey: string
}

/** Thrown for problems retrying won't fix (no key, rejected key, bad post). */
export class PublishError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PublishError"
  }
}

const db = () => getInsForgeAdmin().database

/**
 * Moves the post from scheduled to publishing, only if it's still scheduled for this exact time.
 * Returns null when it was edited, rescheduled, unscheduled or deleted since the job was queued.
 */
export async function claimPost(postId: string, userId: string, scheduledAt: string) {
  const { data, error } = await db()
    .from("content_draft")
    .update({ status: "publishing", publish_error: null })
    .eq("id", postId)
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .eq("scheduled_at", scheduledAt)
    .select(POST_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`Could not claim the post: ${error.message}`)
  return data ? toPost(data as Row) : null
}

const isAiMade = (post: PostRecord) => post.source === "agent" || post.media.some((m) => m.origin !== "upload")

// Zernio's per-platform settings (platformSpecificData)
function zernioSettingsFor(platform: PostPlatform, post: PostRecord): Row {
  const ai = isAiMade(post)
  switch (platform) {
    case "youtube":
      return { title: post.title.slice(0, 100), visibility: "public", madeForKids: false, containsSyntheticMedia: ai, notifySubscribers: true }
    case "tiktok":
      // TikTok Business connections publish videos as public only
      return {
        privacyLevel: "PUBLIC_TO_EVERYONE",
        allowComment: true,
        allowDuet: true,
        allowStitch: true,
        commercialContentType: "none",
        contentPreviewConfirmed: true,
        expressConsentGiven: true,
        videoMadeWithAi: ai,
      }
    case "instagram":
      return { isAiGenerated: ai }
  }
}

function targetFor(platform: PostPlatform, post: PostRecord, hasVideo: boolean): Record<string, unknown> {
  switch (platform) {
    case "youtube":
      return {
        title: post.title.slice(0, PLATFORMS.youtube.titleLimit ?? 100),
        privacyStatus: "public",
        shouldNotifySubscribers: true,
        isMadeForKids: false,
        containsSyntheticMedia: isAiMade(post),
      }
    case "tiktok":
      return {
        privacyLevel: "PUBLIC_TO_EVERYONE",
        disabledComments: false,
        disabledDuet: false,
        disabledStitch: false,
        isBrandedContent: false,
        isYourBrand: false,
        isAiGenerated: isAiMade(post),
        // TikTok photo posts take a title of up to 90 characters
        ...(hasVideo ? {} : { title: post.title.slice(0, 90) }),
      }
    case "instagram":
      return {}
  }
}

/**
 * Turns the post into one request per platform. Each platform goes to the account picked in the
 * composer, or the user's first connected account on it (Zernio's before Blotato's).
 */
export async function buildSubmissions(post: PostRecord, userId: string, scheduledAt: string): Promise<Submission[]> {
  const setup = await getPublishingSetupFor(userId)

  const platforms = post.platforms.filter(isPostPlatform)
  if (platforms.length === 0) throw new PublishError("The post has no platform to publish to.")
  const issue = mediaIssue(platforms, post.media)
  if (issue) throw new PublishError(issue)

  const hasVideo = post.media.some((m) => m.kind === "video")
  const text = [post.body.trim(), post.hashtags.join(" ")].filter(Boolean).join("\n\n")

  return platforms.map((platform) => {
    const accounts = setup.accounts.filter((a) => a.platform === platform)
    const saved = post.targetAccounts[platform]
    // Older posts saved a bare Blotato id
    const wanted = saved ? `${parseTarget(saved).provider}:${parseTarget(saved).accountId}` : null
    const account = accounts.find((a) => a.id === wanted) ?? accounts[0]
    if (!account) throw new PublishError(`No ${PLATFORMS[platform].label} account is connected. Connect one on the Accounts page, then reschedule the post.`)
    if (account.provider === "blotato" && setup.blotatoInvalid) {
      throw new PublishError("Blotato rejected your API key. Add a new one in Settings → Integrations, then reschedule the post.")
    }
    return {
      provider: account.provider,
      accountId: parseTarget(account.id).accountId,
      platform,
      text,
      mediaUrls: post.media.map((m) => m.url),
      mediaKinds: post.media.map((m) => m.kind),
      target: targetFor(platform, post, hasVideo),
      zernioSettings: zernioSettingsFor(platform, post),
      // With a hash of the request added, one Zernio post per post, time, platform and content
      idempotencyKey: `${post.id}-${scheduledAt}-${platform}`,
    }
  })
}

/**
 * Sends one platform's post to its service. A post the service refuses (bad media, validation)
 * comes back as a failed result so the other platforms still go out; network errors and 5xx are
 * thrown so the step retries.
 */
export async function submitPost(userId: string, submission: Submission, submitAt: string): Promise<PublishResult> {
  return submission.provider === "zernio" ? submitToZernio(userId, submission, submitAt) : submitToBlotato(userId, submission)
}

const RECONNECT = "The app couldn't reach your accounts on Zernio. Reconnect them on the Accounts page."

// Refused for this post (validation, payment, account issue), as opposed to a hiccup worth retrying
const isRefusal = (error: ZernioError) => error.status >= 400 && error.status < 500 && error.status !== 429 && error.code !== "idempotency_conflict"

function zernioInput(submission: Submission, scheduledFor: string) {
  const input = {
    accountId: submission.accountId,
    platform: submission.platform,
    content: submission.text,
    mediaItems: submission.mediaUrls.map((url, i) => ({ url, type: submission.mediaKinds[i] ?? "image" })),
    platformSpecificData: submission.zernioSettings,
    scheduledFor,
  }
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16)
  return { ...input, idempotencyKey: `${submission.idempotencyKey}-${hash}` }
}

/** `submitAt` is fixed once per job run, so a retried step sends the very same request. */
async function submitToZernio(userId: string, submission: Submission, submitAt: string): Promise<PublishResult> {
  const base = { platform: submission.platform, provider: "zernio" as const, accountId: submission.accountId }
  const zernio = await zernioFor(userId)
  if (!zernio) throw new PublishError("Your accounts aren't connected anymore. Connect them on the Accounts page.")
  try {
    const { postId } = await zernio.client.createPost(zernioInput(submission, submitAt))
    return { ...base, submissionId: postId, status: "in-progress", publicUrl: null, error: null }
  } catch (error) {
    if (!(error instanceof ZernioError)) throw error
    if (error.isAuthError) throw new PublishError(RECONNECT)
    // The other platforms still go out
    if (isRefusal(error)) return { ...base, submissionId: null, status: "failed", publicUrl: null, error: error.message }
    throw error
  }
}

/** The copies of this post Zernio holds, waiting for their time. */
export const heldOnZernio = (results: PublishResult[]) => results.filter((r) => r.provider === "zernio" && r.status === "scheduled" && r.submissionId)

/** Cancels Zernio's copies. Throws if Zernio can't be reached, so the caller can stop. */
export async function cancelOnZernio(userId: string, results: PublishResult[]) {
  const held = heldOnZernio(results)
  if (held.length === 0) return
  const zernio = await zernioFor(userId)
  if (!zernio) return
  await Promise.all(held.map((r) => zernio.client.deletePost(r.submissionId!)))
}

export type Placement = { post: PostRecord; refused: string | null }

/**
 * Hands a scheduled post to Zernio, or brings Zernio's copies in line after an edit or a move:
 * one Zernio post per platform, updated in place when it already has one. If Zernio refuses any
 * of them, all its copies are cancelled and the post goes back to being a draft, so the post is
 * never half scheduled. If Zernio can't be reached, the post stays scheduled and the publish job
 * sends what's missing when it's due.
 */
export async function placeOnZernio(post: PostRecord, userId: string): Promise<Placement> {
  if (post.status !== "scheduled" || !post.scheduledAt) return { post, refused: null }
  const held = heldOnZernio(post.publishResults)

  let submissions: Submission[]
  try {
    submissions = (await buildSubmissions(post, userId, post.scheduledAt)).filter((s) => s.provider === "zernio")
  } catch (error) {
    if (error instanceof PublishError) return revertToDraft(post, userId, held, [], error.message)
    throw error
  }
  if (submissions.length === 0 && held.length === 0) return { post, refused: null }

  const zernio = await zernioFor(userId)
  if (!zernio) return { post, refused: null }

  // Zernio publishes a time in the past right away, inside the request; keep it a minute ahead
  const scheduledFor = new Date(Math.max(Date.parse(post.scheduledAt), Date.now() + 60_000)).toISOString()
  const placed: PublishResult[] = []
  let refused: string | null = null

  for (const submission of submissions) {
    const label = PLATFORMS[submission.platform].label
    const input = zernioInput(submission, scheduledFor)
    const existing = held.find((r) => r.platform === submission.platform)
    try {
      let postId = existing?.submissionId ?? null
      if (postId) {
        try {
          await zernio.client.updatePost(postId, input)
        } catch (error) {
          // Gone from Zernio (deleted there): make a new one
          if (!(error instanceof ZernioError && error.status === 404)) throw error
          postId = null
        }
      }
      if (!postId) postId = (await zernio.client.createPost(input)).postId
      placed.push({ platform: submission.platform, provider: "zernio", accountId: submission.accountId, submissionId: postId, status: "scheduled", publicUrl: null, error: null })
    } catch (error) {
      if (!(error instanceof ZernioError)) throw error
      if (error.isAuthError) {
        refused = RECONNECT
        break
      }
      if (isRefusal(error)) {
        refused = `Zernio refused the ${label} post: ${error.message.replace(/^Zernio: /, "")}`
        break
      }
      // Unreachable or busy: the publish job sends this platform when it's due
      console.error(`Could not schedule the ${label} post on Zernio yet`, error)
      if (existing) placed.push(existing)
    }
  }

  if (refused) return revertToDraft(post, userId, held, placed, refused)

  // Copies for platforms the post no longer goes to (or that moved to Blotato)
  const stale = held.filter((r) => !placed.some((p) => p.submissionId === r.submissionId))
  await Promise.all(stale.map((r) => zernio.client.deletePost(r.submissionId!).catch((e) => console.error("Could not cancel an old Zernio post", e))))

  const { data, error } = await db()
    .from("content_draft")
    .update({ publish_results: placed })
    .eq("id", post.id)
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .select(POST_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`Could not save the Zernio posts: ${error.message}`)
  return { post: data ? toPost(data as Row) : { ...post, publishResults: placed }, refused: null }
}

async function revertToDraft(post: PostRecord, userId: string, held: PublishResult[], placed: PublishResult[], message: string): Promise<Placement> {
  const ids = new Set([...held, ...placed].map((r) => r.submissionId).filter(Boolean) as string[])
  if (ids.size) {
    const zernio = await zernioFor(userId)
    await Promise.all([...ids].map((id) => zernio?.client.deletePost(id).catch((e) => console.error("Could not cancel a Zernio post", e))))
  }
  const { data } = await db()
    .from("content_draft")
    .update({ status: "draft", publish_results: [] })
    .eq("id", post.id)
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .select(POST_COLUMNS)
    .maybeSingle()
  return { post: data ? toPost(data as Row) : post, refused: `${message} The post was kept as a draft.` }
}

async function submitToBlotato(userId: string, submission: Submission): Promise<PublishResult> {
  const base = { platform: submission.platform, provider: "blotato" as const, accountId: submission.accountId }
  const client = await blotatoFor(userId)
  if (!client) throw new PublishError("Blotato isn't connected anymore.")
  try {
    const { submissionId } = await client.createPost({
      accountId: submission.accountId,
      platform: submission.platform,
      text: submission.text,
      mediaUrls: submission.mediaUrls,
      target: submission.target,
    })
    return { ...base, submissionId, status: "in-progress", publicUrl: null, error: null }
  } catch (error) {
    if (!(error instanceof BlotatoError)) throw error
    if (error.isAuthError) {
      await markBlotatoInvalid(userId, error.message)
      throw new PublishError(error.message)
    }
    if (error.status >= 400 && error.status < 500 && error.status !== 429) {
      return { ...base, submissionId: null, status: "failed", publicUrl: null, error: error.message }
    }
    throw error
  }
}

/** Asks each service how the posts still in progress are doing. */
export async function checkPublishStatus(userId: string, results: PublishResult[]): Promise<PublishResult[]> {
  const pending = (r: PublishResult) => (r.status === "in-progress" || r.status === "scheduled") && r.submissionId
  const waiting = results.filter(pending)
  const zernio = waiting.some((r) => r.provider === "zernio") ? await zernioFor(userId) : null
  const blotato = waiting.some((r) => r.provider !== "zernio") ? await blotatoFor(userId) : null
  return Promise.all(
    results.map(async (result) => {
      if (!pending(result)) return result
      const client = result.provider === "zernio" ? zernio?.client : blotato
      if (!client) throw new PublishError(`${result.provider === "zernio" ? "Your Zernio accounts aren't" : "Blotato isn't"} connected anymore.`)
      const status = await client.getPostStatus(result.submissionId!)
      if (status.status === "published") return { ...result, status: "published" as const, publicUrl: status.publicUrl }
      if (status.status === "failed") return { ...result, status: "failed" as const, error: status.errorMessage ?? "The post couldn't be published." }
      return result
    })
  )
}

export async function savePublishResults(postId: string, userId: string, results: PublishResult[]) {
  const { error } = await db().from("content_draft").update({ publish_results: results }).eq("id", postId).eq("user_id", userId)
  if (error) throw new Error(`Could not save the publish results: ${error.message}`)
}

/**
 * Final status: published if any platform went out (so editing can't post it twice), failed if
 * none did. Platforms that failed or are still processing are listed in publish_error.
 */
export async function finishPost(postId: string, userId: string, results: PublishResult[], onlyIf?: "scheduled") {
  const label = (p: string) => (isPostPlatform(p) ? PLATFORMS[p].label : p)
  const failed = results.filter((r) => r.status === "failed")
  const waiting = results.filter((r) => r.status === "in-progress" || r.status === "scheduled")
  const anyOut = results.some((r) => r.status !== "failed")
  const notes = [
    ...failed.map((r) => `${label(r.platform)}: ${r.error ?? "failed"}`),
    ...(waiting.length ? [`Still processing: ${waiting.map((r) => label(r.platform)).join(", ")}. It may still go live in a few minutes.`] : []),
  ]
  let query = db()
    .from("content_draft")
    .update({
      status: anyOut ? "published" : "failed",
      published_at: anyOut ? new Date().toISOString() : null,
      publish_results: results,
      publish_error: notes.length ? notes.join("\n") : null,
    })
    .eq("id", postId)
    .eq("user_id", userId)
  if (onlyIf) query = query.eq("status", onlyIf)
  const { error } = await query
  if (error) throw new Error(`Could not save the post status: ${error.message}`)
  return { status: anyOut ? "published" : "failed", failed: failed.length, waiting: waiting.length }
}

/** Marks a post that was being published as failed. No-op if it isn't publishing (e.g. still waiting). */
export async function failPost(postId: string, userId: string, message: string) {
  await db()
    .from("content_draft")
    .update({ status: "failed", publish_error: message.slice(0, 1000) })
    .eq("id", postId)
    .eq("user_id", userId)
    .eq("status", "publishing")
}

/** Scheduled posts due before `until` (including overdue ones), for the safety-net sweep. */
export async function listDuePosts(until: number, limit = 200) {
  const { data, error } = await db()
    .from("content_draft")
    .select("id, user_id, scheduled_at")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date(until).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit)
  if (error) throw new Error(`Could not load due posts: ${error.message}`)
  return ((data ?? []) as Row[]).map((r) => ({ postId: String(r.id), userId: String(r.user_id), scheduledAt: new Date(String(r.scheduled_at)).toISOString() }))
}

/**
 * Catches up posts Zernio published on its own while the publish job wasn't running: overdue
 * scheduled posts that Zernio holds for every platform get their final status. Called when the
 * Posts and Calendar pages load; the publish job does the same when it runs.
 */
export async function refreshOverduePosts(userId: string, limit = 10) {
  const { data, error } = await db()
    .from("content_draft")
    .select(POST_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date(Date.now() - 2 * 60_000).toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit)
  if (error) throw new Error(`Could not load overdue posts: ${error.message}`)
  const posts = ((data ?? []) as Row[]).map(toPost).filter((post) => {
    const held = heldOnZernio(post.publishResults)
    return post.platforms.length > 0 && post.platforms.every((p) => held.some((r) => r.platform === p))
  })
  for (const post of posts) {
    const results = await checkPublishStatus(userId, heldOnZernio(post.publishResults))
    if (results.every((r) => r.status === "published" || r.status === "failed")) await finishPost(post.id, userId, results, "scheduled")
  }
}

/** refreshOverduePosts for the signed-in user; never fails the page that calls it. */
export async function refreshOverduePostsFor(client: { auth: { getCurrentUser(): Promise<{ data: { user: { id: string } | null } | null }> } }) {
  try {
    const { data } = await client.auth.getCurrentUser()
    if (data?.user) await refreshOverduePosts(data.user.id)
  } catch (error) {
    console.error("Could not refresh overdue posts", error)
  }
}
