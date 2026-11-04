"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { addDays, format } from "date-fns"
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronsUpDown,
  Clock,
  Eye,
  Globe2,
  ImagePlus,
  Images,
  Pencil,
  Plug,
  Save,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Video,
  X,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"
import { savePost } from "@/app/actions/posts"
import { CampaignIcon } from "@/components/campaign/campaign-icon"
import { ImageEditorDialog } from "@/components/posts/image-editor-dialog"
import { PlatformIcon } from "@/components/posts/platform-icon"
import { PostPreview } from "@/components/posts/post-preview"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ASPECT_RATIOS, type AspectRatio } from "@/lib/imagekit/edits"
import type { Campaign } from "@/lib/campaign"
import { encodeTarget, parseTarget, type PublishingAccount } from "@/lib/posts/targets"
import { generatePostImage, thumbUrl, uploadPostMedia } from "@/lib/posts/client"
import { PLATFORMS, POST_PLATFORMS, isPostPlatform, mediaIssue, parseHashtags, type PostPlatform } from "@/lib/posts/platforms"
import { browserTimeZone, formatInZone, listTimeZones, utcToZonedParts, zoneLabel, zonedTimeToUtc } from "@/lib/posts/time"
import type { PostMedia, PostRecord } from "@/lib/posts/types"

const MAX_MEDIA = 10

function Section({
  id,
  step,
  title,
  description,
  Icon,
  tone,
  children,
}: {
  id?: string
  step: number
  title: string
  description: string
  Icon: LucideIcon
  tone: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border bg-card shadow-sm animate-in fade-in slide-in-from-bottom-1 duration-500" style={{ animationDelay: `${step * 60}ms`, animationFillMode: "both" }}>
      <header className="flex items-center gap-3 border-b px-5 py-4">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", tone)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">Step {step}</span>
      </header>
      <div className="flex flex-col gap-4 p-5">{children}</div>
    </section>
  )
}

function Counter({ value, limit }: { value: number; limit: number }) {
  return <span className={cn("text-xs tabular-nums", value > limit ? "font-medium text-destructive" : "text-muted-foreground")}>{value.toLocaleString()}/{limit.toLocaleString()}</span>
}

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"]

// The form's starting values: an existing post's (when editing) or a fresh post's. Only platforms
// with a connected account can be picked.
function initialValues(post: PostRecord | undefined, connected: PostPlatform[], accounts: PublishingAccount[]) {
  const platforms = (post?.platforms ?? []).filter(isPostPlatform).filter((p) => connected.includes(p))
  const targets: Partial<Record<PostPlatform, string>> = {}
  for (const p of connected) {
    const own = accounts.filter((a) => a.platform === p)
    // Older posts saved a bare Blotato id
    const saved = post?.targetAccounts[p]
    const wanted = saved ? encodeTarget(parseTarget(saved).provider, parseTarget(saved).accountId) : null
    targets[p] = (own.find((a) => a.id === wanted) ?? own[0]).id
  }
  const schedule = post?.scheduledAt && post.timezone ? utcToZonedParts(post.scheduledAt, post.timezone) : null
  const [y, m, d] = schedule?.date.split("-").map(Number) ?? []
  return {
    platforms: platforms.length || post ? platforms : connected.slice(0, 1),
    targets,
    title: post?.title ?? "",
    caption: post?.body ?? "",
    hashtags: post ? parseHashtags(post.hashtags.join(" ")) : [],
    media: post?.media ?? [],
    date: schedule ? new Date(y, m - 1, d) : addDays(new Date(), 1),
    time: schedule?.time ?? "10:00",
    timezone: post?.timezone ?? null,
  }
}

export function PostComposer({
  campaign,
  post,
  accounts,
  blotatoInvalid,
}: {
  campaign: Campaign
  post?: PostRecord
  // Accounts that can publish (Zernio's first, then Blotato's), ids "zernio:<id>" / "blotato:<id>"
  accounts: PublishingAccount[]
  blotatoInvalid: boolean
}) {
  const router = useRouter()
  // The composer only offers platforms with a connected account
  const connected = useMemo(() => POST_PLATFORMS.filter((p) => accounts.some((a) => a.platform === p)), [accounts])
  const [initial] = useState(() => initialValues(post, connected, accounts))
  const isEdit = Boolean(post)
  const wasScheduled = post?.status === "scheduled" || post?.status === "pending"
  const [platforms, setPlatforms] = useState<PostPlatform[]>(initial.platforms)
  const [targets, setTargets] = useState(initial.targets)
  const [title, setTitle] = useState(initial.title)
  const [caption, setCaption] = useState(initial.caption)
  const [hashtags, setHashtags] = useState<string[]>(initial.hashtags)
  const [tagDraft, setTagDraft] = useState("")
  const [media, setMedia] = useState<PostMedia[]>(initial.media)
  const [mediaTab, setMediaTab] = useState<"upload" | "generate">("upload")
  const [uploading, setUploading] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [genPrompt, setGenPrompt] = useState("")
  const [genAspect, setGenAspect] = useState<AspectRatio>("4:5")
  const [generating, setGenerating] = useState(false)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [date, setDate] = useState<Date>(initial.date)
  const [time, setTime] = useState(initial.time)
  const [timezone, setTimezone] = useState(initial.timezone ?? "UTC")
  const [dateOpen, setDateOpen] = useState(false)
  const [zoneOpen, setZoneOpen] = useState(false)
  const [previewPlatform, setPreviewPlatform] = useState<PostPlatform>(initial.platforms[0] ?? connected[0] ?? "instagram")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [intent, setIntent] = useState<"schedule" | "draft">("schedule")
  const fileInput = useRef<HTMLInputElement>(null)

  // The browser's zone is only known on the client; an edited post keeps the zone it was scheduled in
  useEffect(() => {
    if (!initial.timezone) setTimezone(browserTimeZone())
  }, [initial.timezone])
  const zones = useMemo(() => listTimeZones(), [])

  // Keep the preview on a selected platform
  useEffect(() => {
    if (!platforms.includes(previewPlatform) && platforms[0]) setPreviewPlatform(platforms[0])
  }, [platforms, previewPlatform])

  const limits = useMemo(() => {
    const infos = platforms.map((p) => PLATFORMS[p])
    return {
      caption: Math.min(...infos.map((i) => i.captionLimit), 5000),
      hashtags: Math.min(...infos.map((i) => i.hashtagLimit), 40),
      title: infos.reduce<number | null>((min, i) => (i.titleLimit && (!min || i.titleLimit < min) ? i.titleLimit : min), null),
    }
  }, [platforms])

  const allTags = useMemo(() => parseHashtags([...hashtags, tagDraft].join(" ")), [hashtags, tagDraft])
  const scheduledAt = useMemo(() => zonedTimeToUtc(format(date, "yyyy-MM-dd"), time, timezone), [date, time, timezone])

  // Everything that would stop the post from being scheduled
  const issues = useMemo(() => {
    const list: string[] = []
    if (accounts.length === 0) list.push("Connect your social accounts on the Accounts page to schedule posts.")
    if (blotatoInvalid && platforms.some((p) => targets[p]?.startsWith("blotato:"))) list.push("Blotato rejected your API key. Add a new one in Settings → Integrations, or pick another account.")
    if (platforms.length === 0) list.push("Pick at least one platform.")
    if (!title.trim()) list.push("Add a title.")
    if (caption.length > limits.caption) list.push(`Shorten the caption to ${limits.caption} characters.`)
    if (limits.title && title.length > limits.title) list.push(`Shorten the title to ${limits.title} characters for YouTube.`)
    if (allTags.length > limits.hashtags) list.push(`Use at most ${limits.hashtags} hashtags.`)
    const mediaProblem = mediaIssue(platforms, media)
    if (mediaProblem) list.push(mediaProblem)
    if (!scheduledAt || scheduledAt.getTime() < Date.now()) list.push("Pick a time in the future.")
    return list
  }, [accounts, blotatoInvalid, targets, platforms, title, caption, limits, allTags, media, scheduledAt])
  // Problems that stop even a draft from saving
  const draftIssue = useMemo(() => mediaIssue([], media), [media])

  function togglePlatform(p: PostPlatform) {
    setPlatforms((current) => (current.includes(p) ? current.filter((x) => x !== p) : [...current, p]))
    if (!platforms.includes(p)) {
      setPreviewPlatform(p)
      if (media.length === 0) setGenAspect(PLATFORMS[p].aspect)
    }
  }

  function commitTags() {
    if (!tagDraft.trim()) return
    setHashtags(parseHashtags([...hashtags, tagDraft].join(" ")))
    setTagDraft("")
  }

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files)
      .filter((f) => f.type.startsWith("image/") || VIDEO_TYPES.includes(f.type))
      .slice(0, MAX_MEDIA - media.length)
    if (list.length === 0) return
    setMediaError(null)
    setUploading((n) => n + list.length)
    await Promise.all(
      list.map(async (file) => {
        try {
          const { url, kind } = await uploadPostMedia(campaign.id, file)
          setMedia((m) => [...m, { url, kind, originalUrl: null, edits: [], origin: "upload" as const }].slice(0, MAX_MEDIA))
        } catch (e) {
          setMediaError(e instanceof Error ? e.message : "Upload failed.")
        } finally {
          setUploading((n) => n - 1)
        }
      })
    )
  }

  async function generate() {
    if (!genPrompt.trim()) return
    setGenerating(true)
    setMediaError(null)
    try {
      const { url } = await generatePostImage(campaign.id, genPrompt.trim(), genAspect)
      setMedia((m) => [...m, { url, kind: "image" as const, originalUrl: null, edits: [], origin: "generated" as const }].slice(0, MAX_MEDIA))
    } catch (e) {
      setMediaError(e instanceof Error ? e.message : "Generation failed.")
    } finally {
      setGenerating(false)
    }
  }

  // Set once a new post is saved but its scheduling failed, so saving again updates that draft
  const [savedId, setSavedId] = useState<string | null>(post?.id ?? null)

  function submit(kind: "schedule" | "draft") {
    setError(null)
    setIntent(kind)
    startTransition(async () => {
      const result = await savePost({
        campaignId: campaign.id,
        postId: savedId,
        intent: kind,
        title,
        caption,
        hashtags: allTags,
        platforms,
        media,
        targetAccounts: Object.fromEntries(platforms.flatMap((p) => (targets[p] ? [[p, targets[p]]] : []))),
        date: format(date, "yyyy-MM-dd"),
        time,
        timezone,
      })
      if (!result.ok) {
        if (result.post) setSavedId(result.post.id)
        setError(result.error)
        return
      }
      router.push(`/dashboard/posts?saved=${result.post.id}`)
    })
  }

  const busyMedia = uploading > 0 || generating
  const previewData = {
    title,
    caption,
    hashtags: allTags,
    images: media.map((m) => m.url),
    accountName: campaign.name,
    accountAvatar: <CampaignIcon type={campaign.icon_type} icon={campaign.icon} className="size-8 rounded-full" />,
  }
  const editingMedia = editing != null ? (media[editing] ?? null) : null

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center gap-3 animate-in fade-in duration-300">
        <Link href="/dashboard/posts" className="flex size-9 items-center justify-center rounded-lg border bg-card shadow-xs transition-colors hover:bg-muted" aria-label="Back to posts">
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">{isEdit ? "Edit post" : "Create post"}</h2>
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Change anything, or pick a new date and time to reschedule. It hasn't been published yet."
              : "Write it once, preview it on every platform, and schedule it."}
          </p>
        </div>
        {post?.scheduledAt && wasScheduled && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">
            <CalendarClock className="size-3.5" />
            Currently scheduled for {formatInZone(post.scheduledAt, post.timezone)}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        {/* ---- Form ---- */}
        <div className="flex min-w-0 flex-col gap-6">
          <Section step={1} title="Platforms" description="Where this post goes: your accounts connected on Blotato" Icon={Globe2} tone="bg-sky-500/12 text-sky-600 dark:text-sky-400">
            {connected.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center">
                <span className="flex size-11 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-400">
                  <Plug className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">Connect your social accounts first</p>
                  <p className="mt-1 text-xs text-muted-foreground">Connect Instagram, TikTok or YouTube on the Accounts page. It takes a minute and no other sign-up.</p>
                </div>
                <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/dashboard/accounts" />}>
                  <Plug data-icon="inline-start" /> Go to Accounts
                </Button>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {connected.map((p) => {
                const info = PLATFORMS[p]
                const on = platforms.includes(p)
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    aria-pressed={on}
                    className={cn("relative flex items-center gap-3 rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md", on && info.activeTone)}
                  >
                    <span className={cn("flex size-10 items-center justify-center rounded-lg", info.tone)}>
                      <PlatformIcon platform={p} className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{info.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {(() => {
                          const account = accounts.find((a) => a.id === targets[p])
                          return account?.username ? `@${account.username.replace(/^@/, "")}` : (account?.fullname ?? info.aspect)
                        })()}
                        {info.videoOnly && " · video only"}
                      </span>
                    </span>
                    <span className={cn("flex size-5 items-center justify-center rounded-full border transition-all", on ? "border-transparent bg-primary text-primary-foreground" : "bg-background")}>
                      {on && <Check className="size-3" />}
                    </span>
                  </button>
                )
              })}
            </div>
            {/* Several accounts on one platform: pick which one posts */}
            {platforms
              .filter((p) => accounts.filter((a) => a.platform === p).length > 1)
              .map((p) => (
                <div key={p} className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={`account-${p}`} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PlatformIcon platform={p} className="size-3.5" /> Post to
                  </Label>
                  <NativeSelect id={`account-${p}`} size="sm" value={targets[p] ?? ""} onChange={(e) => setTargets((t) => ({ ...t, [p]: e.target.value }))}>
                    {accounts
                      .filter((a) => a.platform === p)
                      .map((a) => (
                        <NativeSelectOption key={a.id} value={a.id}>
                          {a.fullname || a.username}
                          {a.username ? ` (@${a.username.replace(/^@/, "")})` : ""}
                          {a.provider === "blotato" ? " · via Blotato" : ""}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </div>
              ))}
          </Section>

          <Section step={2} title="Content" description="Title, caption and hashtags" Icon={Type} tone="bg-pink-500/12 text-pink-600 dark:text-pink-400">
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="post-title">Title</Label>
                {limits.title ? <Counter value={title.length} limit={limits.title} /> : <span className="text-xs text-muted-foreground">For your reference and YouTube</span>}
              </div>
              <Input id="post-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summer launch teaser" maxLength={300} />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="post-caption">Caption</Label>
                <Counter value={caption.length} limit={limits.caption} />
              </div>
              <Textarea id="post-caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write something your audience will love…" className="min-h-36 resize-y" />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="post-tags">Hashtags</Label>
                <Counter value={allTags.length} limit={limits.hashtags} />
              </div>
              <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
                {hashtags.map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 py-0.5 pr-1 pl-2 text-xs font-medium text-sky-700 animate-in zoom-in-95 dark:text-sky-300">
                    {tag}
                    <button type="button" onClick={() => setHashtags(hashtags.filter((t) => t !== tag))} className="rounded p-0.5 hover:bg-sky-500/20" aria-label={`Remove ${tag}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  id="post-tags"
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "," || e.key === " ") {
                      e.preventDefault()
                      commitTags()
                    } else if (e.key === "Backspace" && !tagDraft && hashtags.length) {
                      setHashtags(hashtags.slice(0, -1))
                    }
                  }}
                  onBlur={commitTags}
                  placeholder={hashtags.length ? "" : "#marketing #launch — press Enter to add"}
                  className="min-w-32 flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
          </Section>

          <Section step={3} title="Media" description="Upload images or a video, or generate images with ImageKit AI" Icon={Images} tone="bg-violet-500/12 text-violet-600 dark:text-violet-400">
            <div className="inline-flex w-fit rounded-lg bg-muted p-[3px]">
              {(
                [
                  ["upload", Upload, "Upload"],
                  ["generate", Sparkles, "Generate with ImageKit AI"],
                ] as const
              ).map(([key, Icon, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMediaTab(key)}
                  className={cn("flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium text-foreground/60 transition-all", mediaTab === key && "bg-background text-foreground shadow-sm")}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>

            {mediaTab === "upload" ? (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  addFiles(e.dataTransfer.files)
                }}
                disabled={media.length >= MAX_MEDIA}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-all hover:border-violet-500/50 hover:bg-violet-500/5 disabled:opacity-50",
                  dragging && "border-violet-500 bg-violet-500/8"
                )}
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-400">
                  {uploading ? <Spinner className="size-5" /> : <ImagePlus className="size-5" />}
                </span>
                <span className="text-sm font-medium">{uploading ? `Uploading ${uploading} file${uploading === 1 ? "" : "s"}…` : "Drop images or a video here, or click to browse"}</span>
                <span className="text-xs text-muted-foreground">Up to {MAX_MEDIA} images (JPG, PNG, WebP, GIF · 10 MB) or one video (MP4, MOV, WebM · 100 MB). YouTube needs a video.</span>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files)
                    e.target.value = ""
                  }}
                />
              </button>
            ) : (
              <div className="flex flex-col gap-3 rounded-xl border bg-linear-to-br from-violet-500/5 to-pink-500/5 p-4">
                <Textarea
                  value={genPrompt}
                  onChange={(e) => setGenPrompt(e.target.value)}
                  placeholder="Describe the image: subject, style, colors, mood… e.g. a flat-lay of iced coffee on a pastel table, soft morning light"
                  className="min-h-24 bg-background"
                  maxLength={1000}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Label htmlFor="gen-aspect" className="text-xs text-muted-foreground">
                    Aspect ratio
                  </Label>
                  <NativeSelect id="gen-aspect" size="sm" value={genAspect} onChange={(e) => setGenAspect(e.target.value as AspectRatio)}>
                    {ASPECT_RATIOS.map((a) => (
                      <NativeSelectOption key={a} value={a}>
                        {a}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <Button onClick={generate} disabled={generating || genPrompt.trim().length < 3 || media.length >= MAX_MEDIA} className="ml-auto bg-violet-600 text-white hover:bg-violet-600/90">
                    {generating ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
                    {generating ? "Generating…" : "Generate image"}
                  </Button>
                </div>
              </div>
            )}

            {mediaError && <p className="text-xs text-destructive">{mediaError}</p>}

            {(media.length > 0 || busyMedia) && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {media.map((m, i) => (
                  <div key={m.url} className="group relative aspect-square overflow-hidden rounded-xl border bg-muted animate-in fade-in zoom-in-95">
                    {m.kind === "video" ? (
                      <video src={m.url} className="size-full object-cover" muted playsInline preload="metadata" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbUrl(m.url, 320)} alt={`Image ${i + 1}`} className="size-full object-cover" />
                    )}
                    {m.kind === "video" && (
                      <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white sm:group-hover:opacity-0">
                        <Video className="size-2.5" /> Video
                      </span>
                    )}
                    {i === 0 && <span className="absolute top-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">Cover</span>}
                    {m.edits.length > 0 && (
                      <span className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded-md bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        <Sparkles className="size-2.5" /> Edited
                      </span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-linear-to-t from-black/70 to-transparent p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      {m.kind !== "video" && (
                        <Button size="xs" variant="secondary" onClick={() => setEditing(i)}>
                          <Pencil data-icon="inline-start" /> Edit image
                        </Button>
                      )}
                      <Button size="icon-xs" variant="secondary" onClick={() => setMedia(media.filter((_, j) => j !== i))} aria-label={m.kind === "video" ? "Remove video" : "Remove image"}>
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
                {busyMedia && (
                  <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/50 text-xs text-muted-foreground">
                    <Spinner className="size-5 text-violet-600" />
                    {generating ? "Generating…" : "Uploading…"}
                  </div>
                )}
              </div>
            )}
          </Section>

          <Section id="schedule" step={4} title={wasScheduled ? "Reschedule" : "Schedule"} description={wasScheduled ? "Pick a new date and time if you want" : "When it should go live"} Icon={CalendarClock} tone="bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <div className="grid gap-3 sm:grid-cols-[1fr_9rem_1.3fr]">
              <div className="grid gap-1.5">
                <Label>Date</Label>
                <Popover open={dateOpen} onOpenChange={setDateOpen}>
                  <PopoverTrigger render={<Button variant="outline" className="h-9 justify-start font-normal" />}>
                    <CalendarDays data-icon="inline-start" className="text-muted-foreground" />
                    {format(date, "EEE, MMM d, yyyy")}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={date}
                      onSelect={(d) => {
                        if (d) setDate(d)
                        setDateOpen(false)
                      }}
                      disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="post-time">Time</Label>
                <div className="relative">
                  <Clock className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="post-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 pl-8" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Time zone</Label>
                <Popover open={zoneOpen} onOpenChange={setZoneOpen}>
                  <PopoverTrigger render={<Button variant="outline" className="h-9 justify-between font-normal" />}>
                    <span className="truncate">
                      {timezone.replace(/_/g, " ")} <span className="text-muted-foreground">({zoneLabel(timezone)})</span>
                    </span>
                    <ChevronsUpDown data-icon="inline-end" className="text-muted-foreground" />
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Search time zones…" />
                      <CommandList className="max-h-64">
                        <CommandEmpty>No time zone found.</CommandEmpty>
                        {zones.map((z) => (
                          <CommandItem
                            key={z}
                            value={z}
                            onSelect={() => {
                              setTimezone(z)
                              setZoneOpen(false)
                            }}
                          >
                            <span className="flex-1 truncate">{z.replace(/_/g, " ")}</span>
                            {z === timezone && <Check className="size-4" />}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {scheduledAt && (
              <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <CalendarClock className="size-3.5 shrink-0" />
                Goes live {formatInZone(scheduledAt.toISOString(), timezone)} ({zoneLabel(timezone)})
                {platforms.length > 0 && ` on ${platforms.map((p) => PLATFORMS[p].label).join(", ")}`}
              </p>
            )}
          </Section>

          {/* Actions */}
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t bg-background/85 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:rounded-2xl lg:border lg:px-5 lg:shadow-sm">
            {(error || issues.length > 0) && (
              <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")}>{error ?? issues[0]}</p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="lg" disabled={pending || busyMedia || !title.trim() || platforms.length === 0 || Boolean(draftIssue)} onClick={() => submit("draft")}>
                {pending && intent === "draft" ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                {wasScheduled ? "Unschedule & save draft" : "Save draft"}
              </Button>
              <Button size="lg" disabled={pending || busyMedia || issues.length > 0} onClick={() => submit("schedule")} className="px-4">
                {pending && intent === "schedule" ? <Spinner data-icon="inline-start" /> : <CalendarClock data-icon="inline-start" />}
                {wasScheduled ? "Update schedule" : "Schedule post"}
              </Button>
            </div>
          </div>
        </div>

        {/* ---- Live preview ---- */}
        <aside className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-2xl border bg-card shadow-sm animate-in fade-in slide-in-from-right-2 duration-500">
            <header className="flex items-center gap-3 border-b px-5 py-4">
              <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                <Eye className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">Live preview</h3>
                <p className="text-xs text-muted-foreground">Updates as you type</p>
              </div>
            </header>
            {platforms.length > 1 && (
              <div className="flex gap-1 border-b px-4 py-2">
                {platforms.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreviewPlatform(p)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-all hover:text-foreground",
                      previewPlatform === p && "bg-muted text-foreground"
                    )}
                  >
                    <PlatformIcon platform={p} className="size-3.5" /> {PLATFORMS[p].label}
                  </button>
                ))}
              </div>
            )}
            <div className="bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-size-[16px_16px] p-5 sm:p-8">
              {platforms.length ? (
                <div key={previewPlatform} className="animate-in fade-in zoom-in-[0.98] duration-300">
                  <PostPreview platform={previewPlatform} data={previewData} />
                </div>
              ) : (
                <p className="py-16 text-center text-sm text-muted-foreground">Pick a platform to see the preview.</p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <ImageEditorDialog
        open={editing != null}
        onOpenChange={(open) => !open && setEditing(null)}
        campaignId={campaign.id}
        media={editingMedia}
        defaultPreset={PLATFORMS[previewPlatform].preset}
        onSave={(updated) => setMedia((m) => m.map((item, i) => (i === editing ? updated : item)))}
      />
    </div>
  )
}
