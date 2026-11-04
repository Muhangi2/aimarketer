"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ArrowLeft, EyeOff, ExternalLink, Eye, Inbox as InboxIcon, MessageCircle, MessagesSquare, Plug, RefreshCw, Reply, Trash2 } from "lucide-react"
import { cn } from "cn"
import {
  deleteComment,
  draftReply,
  loadCommentedPosts,
  loadComments,
  loadConversations,
  loadMessages,
  replyToComment,
  sendMessage,
  setCommentHidden,
} from "@/app/actions/inbox"
import { ReplyBox } from "@/components/inbox/reply-box"
import { PlatformIcon } from "@/components/posts/platform-icon"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { CommentedPost, Conversation, InboxComment, InboxMessage } from "@/lib/zernio/client"

type Tab = "comments" | "messages"

const ago = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? formatDistanceToNow(new Date(t), { addSuffix: true }) : ""
}

function Avatar({ src, name, className }: { src: string | null; name: string; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={cn("size-8 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground", className)}>
      {(name || "?").slice(0, 1).toUpperCase()}
    </span>
  )
}

function Empty({ Icon, title, body }: { Icon: typeof InboxIcon; title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
      <Icon className="size-8 text-muted-foreground/60" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{body}</p>
    </div>
  )
}

const newRequestId = () => crypto.randomUUID()

// ---- Comments ----

function CommentItem({
  comment,
  post,
  campaignId,
  onChanged,
  depth = 0,
}: {
  comment: InboxComment
  post: CommentedPost
  campaignId: string
  onChanged: () => void
  depth?: number
}) {
  const [replying, setReplying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ids = { postId: post.id, accountId: post.accountId, commentId: comment.id }

  async function moderate(action: "hide" | "unhide" | "delete") {
    if (action === "delete" && !confirm("Delete this comment? This can't be undone.")) return
    setBusy(true)
    setError(null)
    const result = action === "delete" ? await deleteComment(ids) : await setCommentHidden(ids, action === "hide")
    setBusy(false)
    if (!result.ok) setError(result.error)
    else onChanged()
  }

  return (
    <li className={cn("flex flex-col gap-2", depth > 0 && "border-l pl-4")}>
      <div className={cn("flex gap-3", comment.isHidden && "opacity-60")}>
        <Avatar src={comment.from.picture} name={comment.from.name || comment.from.username} />
        <div className="min-w-0 flex-1">
          <p className="text-xs">
            <span className="font-semibold">{comment.from.isOwner ? "You" : comment.from.name || `@${comment.from.username}`}</span>
            <span className="text-muted-foreground"> · {ago(comment.createdTime)}</span>
            {comment.isHidden && <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">Hidden</span>}
          </p>
          <p className="mt-0.5 text-sm whitespace-pre-line">{comment.message}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {comment.canReply && !comment.from.isOwner && (
              <Button size="xs" variant="ghost" onClick={() => setReplying((v) => !v)}>
                <Reply data-icon="inline-start" /> Reply
              </Button>
            )}
            {comment.canHide && (
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => moderate(comment.isHidden ? "unhide" : "hide")}>
                {comment.isHidden ? <Eye data-icon="inline-start" /> : <EyeOff data-icon="inline-start" />} {comment.isHidden ? "Unhide" : "Hide"}
              </Button>
            )}
            {comment.canDelete && (
              <Button size="xs" variant="ghost" disabled={busy} onClick={() => moderate("delete")} className="text-destructive hover:text-destructive">
                <Trash2 data-icon="inline-start" /> Delete
              </Button>
            )}
            {comment.url && (
              <a href={comment.url} target="_blank" rel="noreferrer" className="ml-1 text-muted-foreground hover:text-foreground" aria-label="Open on the platform">
                <ExternalLink className="size-3" />
              </a>
            )}
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </div>
      </div>
      {replying && (
        <div className="ml-11">
          <ReplyBox
            autoFocus
            placeholder={`Reply to ${comment.from.name || `@${comment.from.username}`}…`}
            onDraft={async (instruction) => {
              const result = await draftReply({
                kind: "comment",
                platform: post.platform,
                campaignId,
                postText: post.content || null,
                thread: [
                  { from: "them", name: comment.from.name || comment.from.username, text: comment.message },
                  ...comment.replies.map((r) => ({ from: r.from.isOwner ? ("us" as const) : ("them" as const), name: r.from.name || r.from.username, text: r.message })),
                ],
                instruction,
              })
              if (!result.ok) throw new Error(result.error)
              return result.data
            }}
            onSend={async (text) => {
              const result = await replyToComment({ ...ids, message: text, requestId: newRequestId() })
              if (!result.ok) return result.error
              setReplying(false)
              onChanged()
              return null
            }}
          />
        </div>
      )}
      {comment.replies.length > 0 && (
        <ul className="ml-11 flex flex-col gap-3">
          {comment.replies.map((r) => (
            <CommentItem key={r.id} comment={r} post={post} campaignId={campaignId} onChanged={onChanged} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

function CommentsPane({ campaignId }: { campaignId: string }) {
  const [posts, setPosts] = useState<CommentedPost[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState<CommentedPost | null>(null)
  const [comments, setComments] = useState<InboxComment[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const refreshPosts = useCallback(async () => {
    setError(null)
    const result = await loadCommentedPosts()
    if (!result.ok) return setError(result.error)
    setPosts(result.data.items)
    setCursor(result.data.nextCursor)
  }, [])

  const refreshComments = useCallback(async (post: CommentedPost) => {
    const result = await loadComments(post.id, post.accountId)
    if (!result.ok) return setError(result.error)
    setComments(result.data.items)
  }, [])

  useEffect(() => {
    void refreshPosts()
  }, [refreshPosts])

  function open(post: CommentedPost) {
    setSelected(post)
    setComments(null)
    void refreshComments(post)
  }

  return (
    <div className="grid min-h-[32rem] overflow-hidden rounded-2xl border bg-card shadow-sm md:grid-cols-[20rem_minmax(0,1fr)]">
      <div className={cn("flex min-h-0 flex-col border-r", selected && "hidden md:flex")}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <p className="flex-1 text-sm font-semibold">Posts with comments</p>
          <Button size="icon-sm" variant="ghost" onClick={() => void refreshPosts()} aria-label="Refresh">
            <RefreshCw />
          </Button>
        </div>
        {error && !posts && <p className="p-4 text-xs text-destructive">{error}</p>}
        {!posts && !error && (
          <div className="flex flex-1 items-center justify-center p-10">
            <Spinner className="size-5" />
          </div>
        )}
        {posts?.length === 0 && <Empty Icon={MessageCircle} title="No comments yet" body="Comments on your connected accounts' posts show up here." />}
        <ul className="flex-1 overflow-y-auto">
          {posts?.map((p) => (
            <li key={`${p.accountId}-${p.id}`}>
              <button
                type="button"
                onClick={() => open(p)}
                className={cn("flex w-full gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60", selected?.id === p.id && "bg-muted")}
              >
                {p.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.picture} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <PlatformIcon platform={p.platform} className="size-5" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <PlatformIcon platform={p.platform} className="size-3" /> @{p.accountUsername.replace(/^@/, "")}
                  </span>
                  <span className="line-clamp-2 text-sm">{p.content || "(no caption)"}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {p.commentCount} comment{p.commentCount === 1 ? "" : "s"} · {ago(p.createdTime)}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {cursor && (
            <li className="p-3">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={loadingMore}
                onClick={async () => {
                  setLoadingMore(true)
                  const result = await loadCommentedPosts(cursor)
                  setLoadingMore(false)
                  if (!result.ok) return setError(result.error)
                  setPosts((current) => [...(current ?? []), ...result.data.items])
                  setCursor(result.data.nextCursor)
                }}
              >
                {loadingMore ? <Spinner data-icon="inline-start" /> : null} Load more
              </Button>
            </li>
          )}
        </ul>
      </div>

      <div className={cn("flex min-h-0 flex-col", !selected && "hidden md:flex")}>
        {!selected ? (
          <Empty Icon={MessageCircle} title="Pick a post" body="See its comments, draft replies with AI, and send them when they look right." />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Button size="icon-sm" variant="ghost" className="md:hidden" onClick={() => setSelected(null)} aria-label="Back">
                <ArrowLeft />
              </Button>
              <p className="line-clamp-1 flex-1 text-sm font-semibold">{selected.content || "(no caption)"}</p>
              {selected.permalink && (
                <a href={selected.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  Open <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {error && <p className="mb-3 text-xs text-destructive">{error}</p>}
              {!comments ? (
                <div className="flex justify-center p-10">
                  <Spinner className="size-5" />
                </div>
              ) : comments.length === 0 ? (
                <Empty Icon={MessageCircle} title="No comments to show" body="They may have been deleted, or the platform hasn't sent them yet." />
              ) : (
                <ul className="flex flex-col gap-5">
                  {comments.map((c) => (
                    <CommentItem key={c.id} comment={c} post={selected} campaignId={campaignId} onChanged={() => void refreshComments(selected)} />
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---- Messages ----

const DAY_MS = 24 * 60 * 60 * 1000

function windowNote(platform: string, lastIncomingAt: string | null) {
  const since = lastIncomingAt ? Date.now() - Date.parse(lastIncomingAt) : Infinity
  if (platform === "instagram" && since > 7 * DAY_MS) return "Instagram only allows replies within 7 days of their last message, so this may not be delivered."
  if (platform === "tiktok") return since > 2 * DAY_MS ? "TikTok only allows replies within 48 hours of their last message." : "TikTok allows up to 10 replies within 48 hours of their last message."
  return null
}

function MessagesPane({ campaignId }: { campaignId: string }) {
  const [conversations, setConversations] = useState<Conversation[] | null>(null)
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<InboxMessage[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshConversations = useCallback(async () => {
    setError(null)
    const result = await loadConversations()
    if (!result.ok) return setError(result.error)
    setConversations(result.data.items)
  }, [])

  const refreshMessages = useCallback(async (c: Conversation) => {
    const result = await loadMessages(c.id, c.accountId)
    if (!result.ok) return setError(result.error)
    setMessages(result.data)
  }, [])

  useEffect(() => {
    void refreshConversations()
  }, [refreshConversations])

  function open(c: Conversation) {
    setSelected(c)
    setMessages(null)
    setConversations((list) => list?.map((x) => (x.id === c.id ? { ...x, unreadCount: 0 } : x)) ?? null)
    void refreshMessages(c)
  }

  const lastIncomingAt = useMemo(() => [...(messages ?? [])].reverse().find((m) => m.direction === "incoming")?.createdAt ?? null, [messages])

  return (
    <div className="grid min-h-[32rem] overflow-hidden rounded-2xl border bg-card shadow-sm md:grid-cols-[20rem_minmax(0,1fr)]">
      <div className={cn("flex min-h-0 flex-col border-r", selected && "hidden md:flex")}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <p className="flex-1 text-sm font-semibold">Conversations</p>
          <Button size="icon-sm" variant="ghost" onClick={() => void refreshConversations()} aria-label="Refresh">
            <RefreshCw />
          </Button>
        </div>
        {error && !conversations && <p className="p-4 text-xs text-destructive">{error}</p>}
        {!conversations && !error && (
          <div className="flex flex-1 items-center justify-center p-10">
            <Spinner className="size-5" />
          </div>
        )}
        {conversations?.length === 0 && <Empty Icon={MessagesSquare} title="No messages yet" body="DMs to your Instagram and TikTok accounts show up here." />}
        <ul className="flex-1 overflow-y-auto">
          {conversations?.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => open(c)}
                className={cn("flex w-full gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60", selected?.id === c.id && "bg-muted")}
              >
                <span className="relative">
                  <Avatar src={c.participantPicture} name={c.participantName} className="size-10" />
                  <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-card ring-1 ring-border">
                    <PlatformIcon platform={c.platform} className="size-2.5" />
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cn("flex-1 truncate text-sm", c.unreadCount > 0 ? "font-semibold" : "font-medium")}>{c.participantName}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{ago(c.updatedTime)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">{c.lastMessage}</span>
                    {c.unreadCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{c.unreadCount}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={cn("flex min-h-0 flex-col", !selected && "hidden md:flex")}>
        {!selected ? (
          <Empty Icon={MessagesSquare} title="Pick a conversation" body="Read the thread, draft a reply with AI, and send it when it looks right." />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Button size="icon-sm" variant="ghost" className="md:hidden" onClick={() => setSelected(null)} aria-label="Back">
                <ArrowLeft />
              </Button>
              <Avatar src={selected.participantPicture} name={selected.participantName} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{selected.participantName}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <PlatformIcon platform={selected.platform} className="size-3" /> to @{selected.accountUsername.replace(/^@/, "")}
                </p>
              </div>
              {selected.url && (
                <a href={selected.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  Open <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
              {error && <p className="text-xs text-destructive">{error}</p>}
              {!messages ? (
                <div className="flex justify-center p-10">
                  <Spinner className="size-5" />
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={cn("flex max-w-[80%] flex-col gap-1", m.direction === "outgoing" ? "items-end self-end" : "items-start self-start")}>
                    {m.text && (
                      <p className={cn("rounded-2xl px-3 py-2 text-sm whitespace-pre-line", m.direction === "outgoing" ? "bg-primary text-primary-foreground" : "bg-muted")}>{m.text}</p>
                    )}
                    {m.attachments.map((a, i) =>
                      a.type === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={a.url} alt="" className="max-h-48 rounded-xl" />
                      ) : (
                        <a key={i} href={a.url} target="_blank" rel="noreferrer" className="text-xs underline">
                          {a.type} attachment
                        </a>
                      )
                    )}
                    <span className="text-[10px] text-muted-foreground">{ago(m.createdAt)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="border-t p-3">
              <ReplyBox
                key={selected.id}
                placeholder={`Reply to ${selected.participantName}…`}
                note={windowNote(selected.platform, lastIncomingAt)}
                onDraft={async (instruction) => {
                  const thread = (messages ?? [])
                    .filter((m) => m.text)
                    .map((m) => ({ from: m.direction === "outgoing" ? ("us" as const) : ("them" as const), name: m.direction === "outgoing" ? null : selected.participantName, text: m.text }))
                  if (thread.length === 0) throw new Error("There's no message to reply to yet.")
                  const result = await draftReply({ kind: "message", platform: selected.platform, campaignId, postText: null, thread, instruction })
                  if (!result.ok) throw new Error(result.error)
                  return result.data
                }}
                onSend={async (text) => {
                  const result = await sendMessage({
                    conversationId: selected.id,
                    accountId: selected.accountId,
                    platform: selected.platform,
                    message: text,
                    requestId: newRequestId(),
                    lastIncomingAt,
                  })
                  if (!result.ok) return result.error
                  // Show it right away; the platform confirms delivery a moment later
                  setMessages((list) => [
                    ...(list ?? []),
                    { id: `local-${Date.now()}`, text, direction: "outgoing", senderName: null, createdAt: new Date().toISOString(), attachments: [] },
                  ])
                  return null
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function Inbox({ campaignId, connected, configured }: { campaignId: string; connected: boolean; configured: boolean }) {
  const [tab, setTab] = useState<Tab>("comments")

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end gap-4 animate-in fade-in duration-300">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">Inbox</h2>
          <p className="mt-1 text-sm text-muted-foreground">Comments and messages from your connected accounts. Let AI draft a reply, check it, then send.</p>
        </div>
        {connected && (
          <div className="inline-flex rounded-lg bg-muted p-[3px]">
            {(
              [
                ["comments", MessageCircle, "Comments"],
                ["messages", MessagesSquare, "Messages"],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn("flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium text-foreground/60 transition-all", tab === key && "bg-background text-foreground shadow-sm")}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!connected ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/30">
            <InboxIcon className="size-6" />
          </span>
          <h3 className="mt-5 text-lg font-semibold">Connect an account to see your inbox</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {configured ? "Connect Instagram, TikTok or YouTube and their comments and messages land here." : "Connecting accounts needs ZERNIO_API_KEY on the server."}
          </p>
          {configured && (
            <Button className="mt-5" nativeButton={false} render={<Link href="/dashboard/accounts" />}>
              <Plug data-icon="inline-start" /> Connect accounts
            </Button>
          )}
        </div>
      ) : tab === "comments" ? (
        <CommentsPane campaignId={campaignId} />
      ) : (
        <MessagesPane campaignId={campaignId} />
      )}
    </div>
  )
}
