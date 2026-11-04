"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, ExternalLink, Globe2, Pencil, Sparkles, PenLine, Trash2 } from "lucide-react"
import { cn } from "cn"
import { deletePost } from "@/app/actions/posts"
import { CampaignIcon } from "@/components/campaign/campaign-icon"
import { PlatformIcon } from "@/components/posts/platform-icon"
import { PostPreview } from "@/components/posts/post-preview"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import type { Campaign } from "@/lib/campaign"
import { PLATFORMS, isPostPlatform, mediaIssue, type PostPlatform } from "@/lib/posts/platforms"
import { encodeTarget, parseTarget, type PublishingAccount } from "@/lib/posts/targets"
import { formatInZone, zoneLabel } from "@/lib/posts/time"
import { isEditablePost, type PostRecord } from "@/lib/posts/types"
import { STATUS_STYLE } from "@/components/calendar/status"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  )
}

function Limit({ label, value, limit }: { label: string; value: number; limit: number }) {
  const over = value > limit
  return (
    <div className="flex-1 rounded-lg border px-2.5 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn("text-xs font-semibold tabular-nums", over && "text-destructive")}>
        {value.toLocaleString()}
        <span className="font-normal text-muted-foreground">/{limit.toLocaleString()}</span>
      </p>
    </div>
  )
}

/** A post's details on the right: a preview per platform, where it goes, and edit options. */
export function PostDetailSheet({
  post,
  campaign,
  accounts,
  timezone,
  onOpenChange,
  onDeleted,
}: {
  post: PostRecord | null
  campaign: Campaign
  accounts: PublishingAccount[]
  timezone: string
  onOpenChange: (open: boolean) => void
  onDeleted: (id: string) => void
}) {
  const platforms = (post?.platforms ?? []).filter(isPostPlatform)
  const [platform, setPlatform] = useState<PostPlatform | null>(platforms[0] ?? null)
  const [confirming, setConfirming] = useState(false)
  const [deleting, startDelete] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // A different post opens on its first platform
  const postId = post?.id
  useEffect(() => {
    setPlatform(platforms[0] ?? null)
    setConfirming(false)
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId])

  if (!post) return <Sheet open={false} onOpenChange={onOpenChange} />

  const active = platform && platforms.includes(platform) ? platform : (platforms[0] ?? null)
  const info = active ? PLATFORMS[active] : null
  const status = STATUS_STYLE[post.status] ?? STATUS_STYLE.draft
  const editable = isEditablePost(post)
  const editUrl = `/dashboard/posts/${post.id}/edit`

  // The account this platform posts to
  const saved = active ? post.targetAccounts[active] : undefined
  const wanted = saved ? encodeTarget(parseTarget(saved).provider, parseTarget(saved).accountId) : null
  const platformAccounts = accounts.filter((a) => a.platform === active)
  const account = platformAccounts.find((a) => a.id === wanted) ?? platformAccounts[0] ?? null
  const result = post.publishResults.find((r) => r.platform === active)
  const problem = active ? mediaIssue([active], post.media) : null
  const caption = [post.body, post.hashtags.join(" ")].filter(Boolean).join("\n\n")
  const otherZone = post.timezone && post.timezone !== timezone ? post.timezone : null

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader className="border-b p-5 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", status.badge)}>{status.label}</span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {post.source === "agent" ? <Sparkles className="size-3" /> : <PenLine className="size-3" />}
              {post.source === "agent" ? "AI agent" : "Manual"}
            </span>
          </div>
          <SheetTitle className="text-base leading-snug">{post.title}</SheetTitle>
          <SheetDescription className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5" />
            {post.scheduledAt ? `${formatInZone(post.scheduledAt, timezone)} (${zoneLabel(timezone)})` : "Not scheduled yet"}
          </SheetDescription>
        </SheetHeader>

        {platforms.length > 1 && (
          <div className="flex gap-1 border-b px-4 py-2">
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-all hover:text-foreground",
                  active === p && "bg-muted text-foreground"
                )}
              >
                <PlatformIcon platform={p} className="size-3.5" /> {PLATFORMS[p].label}
              </button>
            ))}
          </div>
        )}

        {active && (
          <div key={active} className="bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-size-[16px_16px] p-5 animate-in fade-in duration-300">
            <div className="mx-auto max-w-sm">
              <PostPreview
                platform={active}
                data={{
                  title: post.title,
                  caption: post.body,
                  hashtags: post.hashtags,
                  images: post.media.map((m) => m.url),
                  accountName: account?.username || account?.fullname || campaign.name,
                  accountAvatar: account?.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={account.picture} alt="" className="size-8 rounded-full object-cover" />
                  ) : (
                    <CampaignIcon type={campaign.icon_type} icon={campaign.icon} className="size-8 rounded-full" />
                  ),
                }}
              />
            </div>
          </div>
        )}

        {active && info && (
          <div className="flex flex-col gap-3 border-t p-5">
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <span className={cn("flex size-6 items-center justify-center rounded-md", info.tone)}>
                <PlatformIcon platform={active} className="size-3.5" />
              </span>
              On {info.label}
            </h4>
            <div className="divide-y">
              <Row label="Posts to">
                {account ? (
                  <span className="inline-flex items-center gap-1">
                    {account.username ? `@${account.username.replace(/^@/, "")}` : account.fullname}
                    {account.provider === "blotato" && <span className="font-normal text-muted-foreground">· via Blotato</span>}
                  </span>
                ) : (
                  <Link href="/dashboard/accounts" className="text-destructive underline-offset-2 hover:underline">
                    No account connected
                  </Link>
                )}
              </Row>
              {post.scheduledAt && otherZone && <Row label={`In ${otherZone.replace(/_/g, " ")}`}>{formatInZone(post.scheduledAt, otherZone)}</Row>}
              <Row label="Format">
                {post.media.some((m) => m.kind === "video") ? (active === "youtube" ? "Short / video" : active === "instagram" ? "Reel" : "Video") : post.media.length > 1 ? `Carousel · ${post.media.length} images` : post.media.length ? "Image" : "Text only"}
              </Row>
              {result && (
                <Row label={result.status === "scheduled" ? "Status" : "Result"}>
                  {result.status === "published" ? (
                    result.publicUrl ? (
                      <a href={result.publicUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700 hover:underline dark:text-emerald-300">
                        <CheckCircle2 className="size-3" /> Live <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="text-emerald-700 dark:text-emerald-300">Published</span>
                    )
                  ) : result.status === "scheduled" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="size-3" /> Booked on Zernio
                    </span>
                  ) : result.status === "failed" ? (
                    <span className="text-destructive">{result.error ?? "Failed"}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-sky-700 dark:text-sky-300">
                      <Clock className="size-3" /> Processing
                    </span>
                  )}
                </Row>
              )}
            </div>
            <div className="flex gap-2">
              <Limit label="Caption" value={caption.length} limit={info.captionLimit} />
              <Limit label="Hashtags" value={post.hashtags.length} limit={info.hashtagLimit} />
              {info.titleLimit && <Limit label="Title" value={post.title.length} limit={info.titleLimit} />}
            </div>
            {problem && editable && (
              <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-px size-3.5 shrink-0" /> {problem}
              </p>
            )}
            {info.videoOnly && !problem && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Globe2 className="size-3" /> YouTube takes videos only; it goes out as a Short when it&apos;s vertical.
              </p>
            )}
          </div>
        )}

        {post.publishError && (post.status === "failed" || post.status === "published") && (
          <p className="mx-5 mb-4 flex items-start gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-2 text-xs whitespace-pre-line text-destructive">
            <AlertTriangle className="mt-px size-3.5 shrink-0" /> {post.publishError}
          </p>
        )}

        <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t bg-popover p-4">
          {error && <p className="text-xs text-destructive">{error}</p>}
          {confirming ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs">Delete this post{post.status === "scheduled" ? " so it won't be published" : ""}?</p>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleting}
                onClick={() =>
                  startDelete(async () => {
                    const r = await deletePost(post.id)
                    if (!r.ok) return setError(r.error ?? "Couldn't delete the post.")
                    onDeleted(post.id)
                  })
                }
              >
                {deleting && <Spinner data-icon="inline-start" />} Delete
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {editable ? (
                <>
                  <Button size="sm" className="flex-1" nativeButton={false} render={<Link href={editUrl} />}>
                    <Pencil data-icon="inline-start" /> Edit post
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" nativeButton={false} render={<Link href={`${editUrl}#schedule`} />}>
                    <CalendarClock data-icon="inline-start" /> {post.scheduledAt ? "Reschedule" : "Schedule"}
                  </Button>
                </>
              ) : (
                <p className="flex-1 self-center text-xs text-muted-foreground">
                  {post.status === "publishing" ? "Going out now, so it can't be changed." : "Already published, so it can't be changed."}
                </p>
              )}
              <Button size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirming(true)} aria-label="Delete post">
                <Trash2 />
              </Button>
            </div>
          )}
          {editable && <p className="text-[11px] text-muted-foreground">Tip: drag the post on the calendar to move it to another day or time.</p>}
        </div>
      </SheetContent>
    </Sheet>
  )
}
