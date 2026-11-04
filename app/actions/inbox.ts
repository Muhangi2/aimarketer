"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { draftReply as draftWithAI } from "@/lib/ai/replies"
import { ModelFormatError, ModelUnavailableError } from "@/lib/ai/llm"
import { ZernioError, type CommentedPost, type Conversation, type InboxComment, type InboxMessage, type Page } from "@/lib/zernio/client"
import { syncZernioAccounts, zernioFor } from "@/lib/zernio/store"

/*
 * The Inbox: comments and DMs on the user's connected accounts, read and answered through their
 * own Zernio profile. Replies are only ever sent when the user clicks Send.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const id = z.string().trim().min(1).max(300)
const text = z.string().trim().min(1, "Write a reply first.").max(5000)
// A fresh UUID per reply, so a retried request can't post it twice
const requestId = z.string().uuid()

async function currentUserId() {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  if (!data?.user) redirect("/sign-in")
  return data.user.id
}

function failure<T>(error: unknown, fallback: string): Result<T> {
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Some details are invalid." }
  if (error instanceof ZernioError) return { ok: false, error: error.message }
  if (error instanceof ModelUnavailableError || error instanceof ModelFormatError) return { ok: false, error: error.message }
  console.error(fallback, error)
  return { ok: false, error: fallback }
}

/** The user's Zernio client, checking the account is one of their own (refreshed once if it's new). */
async function forAccount(userId: string, accountId?: string) {
  const zernio = await zernioFor(userId)
  if (!zernio) throw new ZernioError("Connect an account on the Accounts page first.", 404)
  if (accountId && !zernio.profile.accounts.some((a) => a.id === accountId)) {
    const fresh = await syncZernioAccounts(userId)
    if (!fresh.some((a) => a.id === accountId)) throw new ZernioError("That account isn't connected.", 404)
  }
  return zernio
}

// ---- Comments ----

export async function loadCommentedPosts(cursor?: string): Promise<Result<Page<CommentedPost>>> {
  const userId = await currentUserId()
  try {
    const zernio = await forAccount(userId)
    return { ok: true, data: await zernio.client.listCommentedPosts(zernio.profile.profileId, cursor) }
  } catch (error) {
    return failure(error, "Couldn't load your comments. Please try again.")
  }
}

export async function loadComments(postId: string, accountId: string, cursor?: string): Promise<Result<Page<InboxComment>>> {
  const userId = await currentUserId()
  try {
    const zernio = await forAccount(userId, id.parse(accountId))
    return { ok: true, data: await zernio.client.listComments(id.parse(postId), accountId, cursor) }
  } catch (error) {
    return failure(error, "Couldn't load the comments. Please try again.")
  }
}

const replySchema = z.object({ postId: id, accountId: id, commentId: id.nullable(), message: text, requestId })

export async function replyToComment(input: z.input<typeof replySchema>): Promise<Result<null>> {
  const userId = await currentUserId()
  try {
    const reply = replySchema.parse(input)
    const zernio = await forAccount(userId, reply.accountId)
    await zernio.client.replyToComment(reply.postId, reply.accountId, reply.message, reply.commentId, reply.requestId)
    return { ok: true, data: null }
  } catch (error) {
    return failure(error, "Couldn't post the reply. Please try again.")
  }
}

const moderateSchema = z.object({ postId: id, accountId: id, commentId: id })

export async function setCommentHidden(input: z.input<typeof moderateSchema>, hidden: boolean): Promise<Result<null>> {
  const userId = await currentUserId()
  try {
    const c = moderateSchema.parse(input)
    const zernio = await forAccount(userId, c.accountId)
    await zernio.client.setCommentHidden(c.postId, c.commentId, c.accountId, hidden)
    return { ok: true, data: null }
  } catch (error) {
    return failure(error, `Couldn't ${hidden ? "hide" : "unhide"} the comment. Please try again.`)
  }
}

export async function deleteComment(input: z.input<typeof moderateSchema>): Promise<Result<null>> {
  const userId = await currentUserId()
  try {
    const c = moderateSchema.parse(input)
    const zernio = await forAccount(userId, c.accountId)
    await zernio.client.deleteComment(c.postId, c.commentId, c.accountId)
    return { ok: true, data: null }
  } catch (error) {
    return failure(error, "Couldn't delete the comment. Please try again.")
  }
}

// ---- DMs ----

export async function loadConversations(cursor?: string): Promise<Result<Page<Conversation>>> {
  const userId = await currentUserId()
  try {
    const zernio = await forAccount(userId)
    return { ok: true, data: await zernio.client.listConversations(zernio.profile.profileId, cursor) }
  } catch (error) {
    return failure(error, "Couldn't load your messages. Please try again.")
  }
}

export async function loadMessages(conversationId: string, accountId: string): Promise<Result<InboxMessage[]>> {
  const userId = await currentUserId()
  try {
    const zernio = await forAccount(userId, id.parse(accountId))
    const messages = await zernio.client.listMessages(id.parse(conversationId), accountId)
    // Opening the conversation reads it; not worth failing over
    zernio.client.markRead(conversationId, accountId).catch(() => {})
    return { ok: true, data: messages }
  } catch (error) {
    return failure(error, "Couldn't load the conversation. Please try again.")
  }
}

const sendSchema = z.object({
  conversationId: id,
  accountId: id,
  platform: z.string().max(40),
  message: text,
  requestId,
  // When the person last wrote, to pick Instagram's rule for replies after 24 hours
  lastIncomingAt: z.string().datetime({ offset: true }).nullable(),
})

const DAY_MS = 24 * 60 * 60 * 1000

export async function sendMessage(input: z.input<typeof sendSchema>): Promise<Result<null>> {
  const userId = await currentUserId()
  try {
    const m = sendSchema.parse(input)
    const zernio = await forAccount(userId, m.accountId)
    // Every reply here is written or approved by a person, which Instagram allows for 7 days
    const humanAgent = m.platform === "instagram" && m.lastIncomingAt != null && Date.now() - Date.parse(m.lastIncomingAt) > DAY_MS
    await zernio.client.sendMessage(m.conversationId, m.accountId, m.message, m.requestId, humanAgent)
    return { ok: true, data: null }
  } catch (error) {
    return failure(error, "Couldn't send the message. Please try again.")
  }
}

// ---- AI drafts ----

const draftSchema = z.object({
  kind: z.enum(["comment", "message"]),
  platform: z.string().max(40),
  campaignId: z.string().uuid(),
  postText: z.string().max(5000).nullable(),
  thread: z.array(z.object({ from: z.enum(["them", "us"]), name: z.string().max(200).nullable(), text: z.string().max(5000) })).min(1).max(50),
  instruction: z.string().max(500).nullable(),
})

/** An AI-written reply for the user to edit and send. Nothing is sent from here. */
export async function draftReply(input: z.input<typeof draftSchema>): Promise<Result<string>> {
  await currentUserId()
  try {
    const d = draftSchema.parse(input)
    const insforge = await createInsForgeServerClient()
    // RLS only returns the caller's own campaigns
    const { data: campaign } = await insforge.database.from("campaign").select("name").eq("id", d.campaignId).maybeSingle()
    const brandName = campaign ? String((campaign as { name: unknown }).name) : "our brand"
    const reply = await draftWithAI({ ...d, brandName })
    if (!reply) return { ok: false, error: "The AI didn't write a reply. Try again." }
    return { ok: true, data: reply }
  } catch (error) {
    return failure(error, "Couldn't draft a reply. Please try again.")
  }
}
