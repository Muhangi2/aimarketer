"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import {
  Bot,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  ImageIcon,
  Layers,
  MoreHorizontal,
  PenLine,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"
import { deletePost } from "@/app/actions/posts"
import { CreatePostMenu } from "@/components/posts/create-post-menu"
import { PlatformIcon } from "@/components/posts/platform-icon"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { thumbUrl } from "@/lib/posts/client"
import { PLATFORMS, isPostPlatform } from "@/lib/posts/platforms"
import { formatInZone } from "@/lib/posts/time"
import { isEditablePost, type PostRecord, type PostStatus } from "@/lib/posts/types"

const STATUS_STYLE: Record<PostStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-500/12 text-slate-700 dark:text-slate-300" },
  approved: { label: "Approved", className: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
  pending: { label: "Pending", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  scheduled: { label: "Scheduled", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  publishing: { label: "Publishing…", className: "bg-sky-500/12 text-sky-700 dark:text-sky-300" },
  published: { label: "Published", className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
  archived: { label: "Archived", className: "bg-muted text-muted-foreground" },
}

const TABS = [
  { key: "all", label: "All" },
  { key: "scheduled", label: "Scheduled" },
  { key: "drafts", label: "Drafts" },
  { key: "published", label: "Published" },
] as const
type Tab = (typeof TABS)[number]["key"]

const inTab = (post: PostRecord, tab: Tab) =>
  tab === "all"
    ? post.status !== "archived"
    : tab === "scheduled"
      ? post.status === "scheduled" || post.status === "pending" || post.status === "publishing"
      : tab === "drafts"
        ? post.status === "draft" || post.status === "approved"
        : post.status === "published"

function Stat({ label, value, Icon, tone }: { label: string; value: number; Icon: LucideIcon; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <span className={cn("flex size-10 items-center justify-center rounded-xl", tone)}>
        <Icon className="size-4.5" />
      </span>
      <div>
        <p className="text-2xl leading-none font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

function PostCard({ post, highlighted, onDelete, index }: { post: PostRecord; highlighted: boolean; onDelete: () => void; index: number }) {
  const router = useRouter()
  const status = STATUS_STYLE[post.status] ?? STATUS_STYLE.draft
  const cover = post.media[0]?.url
  // Not published yet: the user can still change it and pick a new time
  const editable = isEditablePost(post)
  const scheduled = post.status === "scheduled" || post.status === "pending"
  const editUrl = `/dashboard/posts/${post.id}/edit`
  const rescheduleUrl = `${editUrl}#schedule`
  const when = post.scheduledAt
    ? `${formatInZone(post.scheduledAt, post.timezone)}`
    : `Created ${formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}`

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-500",
        highlighted && "ring-3 ring-primary/30 border-primary/40"
      )}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms`, animationFillMode: "both" }}
    >
      <div className="relative aspect-4/3 overflow-hidden bg-muted">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl(cover)} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 bg-linear-to-br from-pink-500/10 via-violet-500/10 to-sky-500/10 p-6 text-center">
            <FileText className="size-7 text-muted-foreground/70" />
            <p className="line-clamp-3 text-xs text-muted-foreground">{post.body || post.title}</p>
          </div>
        )}
        <span
          className={cn(
            "absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur",
            post.source === "agent" ? "bg-violet-600/90 text-white" : "bg-background/90 text-foreground"
          )}
        >
          {post.source === "agent" ? <Sparkles className="size-3" /> : <PenLine className="size-3" />}
          {post.source === "agent" ? "AI agent" : "Manual"}
        </span>
        {post.media.length > 1 && (
          <span className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
            <Layers className="size-3" /> {post.media.length}
          </span>
        )}
        {editable && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-linear-to-t from-black/70 to-transparent p-3 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <Button size="xs" variant="secondary" onClick={() => router.push(editUrl)}>
              <Pencil data-icon="inline-start" /> Edit
            </Button>
            {scheduled && (
              <Button size="xs" variant="secondary" onClick={() => router.push(rescheduleUrl)}>
                <CalendarClock data-icon="inline-start" /> Reschedule
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start gap-2">
          <h3 className="line-clamp-2 flex-1 text-sm leading-snug font-semibold">{post.title}</h3>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1 shrink-0" aria-label="Post actions" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {editable && (
                <>
                  <DropdownMenuItem onClick={() => router.push(editUrl)}>
                    <Pencil /> Edit post
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push(rescheduleUrl)}>
                    <CalendarClock /> {scheduled ? "Reschedule" : "Schedule"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {post.body && <p className="line-clamp-2 text-xs text-muted-foreground">{post.body}</p>}
        {post.hashtags.length > 0 && (
          <p className="truncate text-xs text-sky-700 dark:text-sky-400">{post.hashtags.slice(0, 5).join(" ")}</p>
        )}
        {post.status === "scheduled" && post.publishResults.some((r) => r.status === "scheduled") && (
          <p className="inline-flex w-fit items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300" title="Zernio holds this post and publishes it at the scheduled time.">
            <CheckCircle2 className="size-3" /> Booked on Zernio
          </p>
        )}
        {(post.status === "published" || post.status === "failed") && post.publishResults.some((r) => r.publicUrl) && (
          <div className="flex flex-wrap gap-1.5">
            {post.publishResults
              .filter((r) => r.publicUrl)
              .map((r) => (
                <a
                  key={r.platform}
                  href={r.publicUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                >
                  <PlatformIcon platform={r.platform} className="size-3" /> View <ExternalLink className="size-2.5" />
                </a>
              ))}
          </div>
        )}
        {(post.status === "published" || post.status === "failed") && post.publishError && (
          <p className="flex items-start gap-1.5 rounded-md bg-destructive/8 px-2 py-1.5 text-[11px] whitespace-pre-line text-destructive" title={post.publishError}>
            <AlertTriangle className="mt-px size-3 shrink-0" />
            <span className="line-clamp-3">{post.publishError}</span>
          </p>
        )}
        <div className="mt-auto flex items-center gap-2 border-t pt-3">
          <div className="flex -space-x-1">
            {post.platforms.map((p) => (
              <span
                key={p}
                title={isPostPlatform(p) ? PLATFORMS[p].label : p}
                className={cn("flex size-6 items-center justify-center rounded-full ring-2 ring-card", isPostPlatform(p) ? PLATFORMS[p].tone : "bg-muted text-muted-foreground")}
              >
                <PlatformIcon platform={p} className="size-3" />
              </span>
            ))}
          </div>
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {post.scheduledAt && <CalendarClock className="mr-1 inline size-3 -translate-y-px" />}
            {when}
          </span>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", status.className)}>{status.label}</span>
        </div>
      </div>
    </article>
  )
}

export function PostsBoard({ posts, highlightId }: { posts: PostRecord[]; highlightId?: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("all")
  const [source, setSource] = useState<"all" | "agent" | "manual">("all")
  const [query, setQuery] = useState("")
  const [toDelete, setToDelete] = useState<PostRecord | null>(null)
  const [deleting, startDelete] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const counts = useMemo(
    () => ({
      total: posts.filter((p) => p.status !== "archived").length,
      scheduled: posts.filter((p) => inTab(p, "scheduled")).length,
      drafts: posts.filter((p) => inTab(p, "drafts")).length,
      ai: posts.filter((p) => p.source === "agent").length,
    }),
    [posts]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return posts.filter(
      (p) =>
        inTab(p, tab) &&
        (source === "all" || p.source === source) &&
        (!q || `${p.title} ${p.body} ${p.hashtags.join(" ")}`.toLowerCase().includes(q))
    )
  }, [posts, tab, source, query])

  function confirmDelete() {
    if (!toDelete) return
    setDeleteError(null)
    startDelete(async () => {
      const result = await deletePost(toDelete.id)
      if (!result.ok) {
        setDeleteError(result.error ?? "Couldn't delete the post.")
        return
      }
      setToDelete(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end gap-4 animate-in fade-in duration-300">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">Posts</h2>
          <p className="mt-1 text-sm text-muted-foreground">Everything your AI agents drafted and everything you wrote, in one place.</p>
        </div>
        <CreatePostMenu />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total posts" value={counts.total} Icon={FileText} tone="bg-pink-500/12 text-pink-600 dark:text-pink-400" />
        <Stat label="Scheduled" value={counts.scheduled} Icon={CalendarClock} tone="bg-amber-500/15 text-amber-600 dark:text-amber-400" />
        <Stat label="Drafts" value={counts.drafts} Icon={CheckCircle2} tone="bg-sky-500/12 text-sky-600 dark:text-sky-400" />
        <Stat label="AI-generated" value={counts.ai} Icon={Bot} tone="bg-violet-500/12 text-violet-600 dark:text-violet-400" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-muted p-[3px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn("rounded-md px-3 py-1 text-sm font-medium text-foreground/60 transition-all hover:text-foreground", tab === t.key && "bg-background text-foreground shadow-sm")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border p-[3px]">
          {(
            [
              ["all", "All sources", null],
              ["agent", "AI agent", Sparkles],
              ["manual", "Manual", PenLine],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSource(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-all hover:text-foreground",
                source === key && "bg-muted text-foreground"
              )}
            >
              {Icon && <Icon className="size-3" />} {label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search posts…" className="h-9 pl-8" />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center animate-in fade-in">
          <div className="relative">
            <span className="absolute inset-0 scale-150 rounded-full bg-pink-500/12 opacity-40 blur-xl" />
            <span className="relative flex size-14 items-center justify-center rounded-2xl bg-pink-500/12 text-pink-600 ring-8 ring-muted/60 dark:text-pink-400">
              <ImageIcon className="size-6" />
            </span>
          </div>
          <p className="mt-6 text-sm font-semibold">{posts.length === 0 ? "No posts yet" : "No posts match these filters"}</p>
          <p className="mt-1 max-w-xs text-xs text-balance text-muted-foreground">
            {posts.length === 0 ? "Write your first post, or brief your AI agents and they'll draft some for you." : "Try another tab, source or search."}
          </p>
          {posts.length === 0 && (
            <div className="mt-5">
              <CreatePostMenu />
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((post, i) => (
            <PostCard key={post.id} post={post} index={i} highlighted={post.id === highlightId} onDelete={() => setToDelete(post)} />
          ))}
        </div>
      )}

      <AlertDialog open={toDelete != null} onOpenChange={(open) => !open && !deleting && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{toDelete?.title}&rdquo; will be removed{toDelete?.status === "scheduled" ? " and won't be published" : ""}. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={confirmDelete}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
