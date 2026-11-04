"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Film, FileText, GripVertical, Inbox, Loader2, X } from "lucide-react"
import { cn } from "cn"
import { reschedulePost } from "@/app/actions/posts"
import { PostDetailSheet } from "@/components/calendar/post-detail-sheet"
import { STATUS_STYLE } from "@/components/calendar/status"
import { CreatePostMenu } from "@/components/posts/create-post-menu"
import { PlatformIcon } from "@/components/posts/platform-icon"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { Campaign } from "@/lib/campaign"
import { thumbUrl } from "@/lib/posts/client"
import { PLATFORMS, POST_PLATFORMS, type PostPlatform } from "@/lib/posts/platforms"
import type { PublishingAccount } from "@/lib/posts/targets"
import { browserTimeZone, formatInZone, listTimeZones, utcToZonedParts, zoneLabel, zonedTimeToUtc } from "@/lib/posts/time"
import { isEditablePost, type PostRecord } from "@/lib/posts/types"

type View = "month" | "week"
type Placed = { post: PostRecord; date: string; time: string }

// Weeks start on Monday
const WEEK = { weekStartsOn: 1 as const }
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const MONTH_VISIBLE = 3
// A dropped draft lands at this time on the month view
const DEFAULT_TIME = "10:00"
// The week view opens scrolled to this hour
const FIRST_VISIBLE_HOUR = 7

const toDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(y, m - 1, d)
}
const dayKey = (d: Date) => format(d, "yyyy-MM-dd")
const hourLabel = (h: number) => format(new Date(2000, 0, 1, h), "h a")
const timeLabel = (time: string) => format(new Date(`2000-01-01T${time}:00`), "h:mm a")

// Not published or going out: it can be moved
const canMove = (post: PostRecord) => isEditablePost(post)

function Thumb({ post, className }: { post: PostRecord; className?: string }) {
  const first = post.media[0]
  if (!first) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded bg-muted text-muted-foreground", className)}>
        <FileText className="size-3" />
      </span>
    )
  }
  if (first.kind === "video") {
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded bg-zinc-900 text-white", className)}>
        <Film className="size-3" />
      </span>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={thumbUrl(first.url, 96)} alt="" className={cn("shrink-0 rounded object-cover", className)} />
}

function PlatformDots({ platforms }: { platforms: string[] }) {
  return (
    <span className="flex shrink-0 -space-x-1">
      {platforms.map((p) => (
        <span
          key={p}
          className={cn("flex size-4 items-center justify-center rounded-full ring-1 ring-card", PLATFORMS[p as PostPlatform]?.tone ?? "bg-muted")}
          title={PLATFORMS[p as PostPlatform]?.label ?? p}
        >
          <PlatformIcon platform={p} className="size-2.5" />
        </span>
      ))}
    </span>
  )
}

/** A post on the calendar: compact on the month view, a little card on the week view and in the drafts tray. */
function PostChip({
  entry,
  variant,
  pending,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  entry: { post: PostRecord; time: string | null }
  variant: "month" | "week" | "tray"
  pending: boolean
  dragging: boolean
  onOpen: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  const { post, time } = entry
  const movable = canMove(post) && !pending
  const style = STATUS_STYLE[post.status] ?? STATUS_STYLE.draft

  return (
    <button
      type="button"
      draggable={movable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      title={`${post.title}${time ? ` · ${timeLabel(time)}` : ""} · ${style.label}`}
      className={cn(
        "group/chip relative flex w-full min-w-0 items-center gap-1.5 rounded-md border border-l-[3px] bg-card text-left shadow-xs transition-all hover:-translate-y-px hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        style.accent,
        movable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        variant === "month" ? "px-1.5 py-1" : "p-2",
        (pending || dragging) && "opacity-50",
        post.status === "published" && "bg-emerald-500/[0.04]"
      )}
    >
      {variant === "month" ? (
        <>
          <Thumb post={post} className="hidden size-5 sm:flex" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              {time && <span className="shrink-0 text-[10px] font-semibold text-muted-foreground tabular-nums">{timeLabel(time)}</span>}
              <span className="truncate text-[11px] font-medium">{post.title}</span>
            </span>
          </span>
          <span className="hidden lg:flex">
            <PlatformDots platforms={post.platforms} />
          </span>
        </>
      ) : (
        <>
          <Thumb post={post} className="size-9" />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-xs leading-tight font-medium">{post.title}</span>
            <span className="mt-1 flex items-center gap-1.5">
              <PlatformDots platforms={post.platforms} />
              {time && <span className="text-[10px] text-muted-foreground tabular-nums">{timeLabel(time)}</span>}
              {variant === "tray" && <span className={cn("rounded px-1 text-[10px]", style.badge)}>{style.label}</span>}
            </span>
          </span>
          {movable && <GripVertical className="size-3.5 shrink-0 text-muted-foreground/50 opacity-0 transition-opacity group-hover/chip:opacity-100" />}
        </>
      )}
      {pending && <Loader2 className="absolute top-1 right-1 size-3 animate-spin text-muted-foreground" />}
    </button>
  )
}

export function CalendarView({ campaign, posts, accounts }: { campaign: Campaign; posts: PostRecord[]; accounts: PublishingAccount[] }) {
  const [timezone, setTimezone] = useState("UTC")
  const [view, setView] = useState<View>("month")
  const [anchor, setAnchor] = useState(() => dayKey(new Date()))
  const [items, setItems] = useState(posts)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null)
  const [platformFilter, setPlatformFilter] = useState<PostPlatform | "all">("all")
  const [now, setNow] = useState(() => Date.now())
  const weekScroll = useRef<HTMLDivElement>(null)
  const firstHourRow = useRef<HTMLDivElement>(null)

  // The browser's zone is only known on the client
  useEffect(() => {
    const zone = browserTimeZone()
    setTimezone(zone)
    setAnchor(utcToZonedParts(new Date().toISOString(), zone).date)
  }, [])
  useEffect(() => setItems(posts), [posts])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), notice.kind === "ok" ? 3500 : 7000)
    return () => clearTimeout(timer)
  }, [notice])
  // The week view opens at the start of the working day
  useEffect(() => {
    if (view === "week" && weekScroll.current && firstHourRow.current) weekScroll.current.scrollTop = firstHourRow.current.offsetTop - 48
  }, [view])

  // Built in the browser only: the server's time zone data can give some zones a different offset
  const [zones, setZones] = useState<{ zone: string; label: string }[]>([])
  useEffect(() => setZones(listTimeZones().map((zone) => ({ zone, label: zoneLabel(zone) }))), [])
  const today = utcToZonedParts(new Date(now).toISOString(), timezone).date
  const nowParts = utcToZonedParts(new Date(now).toISOString(), timezone)

  const visible = useMemo(() => items.filter((p) => p.status !== "archived" && (platformFilter === "all" || p.platforms.includes(platformFilter))), [items, platformFilter])

  // Scheduled posts by day, in the viewer's time zone
  const byDay = useMemo(() => {
    const map = new Map<string, Placed[]>()
    for (const post of visible) {
      if (!post.scheduledAt) continue
      const { date, time } = utcToZonedParts(post.scheduledAt, timezone)
      map.set(date, [...(map.get(date) ?? []), { post, date, time }])
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time))
    return map
  }, [visible, timezone])

  // Drafts without a date, waiting to be dropped on the calendar
  const drafts = useMemo(() => visible.filter((p) => !p.scheduledAt && canMove(p)), [visible])

  const anchorDay = toDay(anchor)
  const days = useMemo(() => {
    const d = toDay(anchor)
    return view === "month"
      ? eachDayOfInterval({ start: startOfWeek(startOfMonth(d), WEEK), end: endOfWeek(endOfMonth(d), WEEK) })
      : eachDayOfInterval({ start: startOfWeek(d, WEEK), end: endOfWeek(d, WEEK) })
  }, [anchor, view])

  const inRange = days.reduce((n, d) => n + (view === "month" && !isSameMonth(d, anchorDay) ? 0 : (byDay.get(dayKey(d))?.length ?? 0)), 0)
  const title =
    view === "month"
      ? format(anchorDay, "MMMM yyyy")
      : `${format(days[0], "MMM d")} – ${format(days[6], isSameMonth(days[0], days[6]) ? "d, yyyy" : "MMM d, yyyy")}`

  const selected = items.find((p) => p.id === selectedId) ?? null

  function step(dir: 1 | -1) {
    const next = view === "month" ? addMonths(anchorDay, dir) : addWeeks(anchorDay, dir)
    setAnchor(dayKey(next))
  }

  // ---- Drag and drop ----

  function startDrag(e: React.DragEvent, post: PostRecord) {
    if (!canMove(post) || pending.has(post.id)) return e.preventDefault()
    e.dataTransfer.setData("text/plain", post.id)
    e.dataTransfer.effectAllowed = "move"
    setDragId(post.id)
  }

  function endDrag() {
    setDragId(null)
    setDropKey(null)
  }

  // A day (month view) or an hour slot (week view) that's already over can't take a post
  const isPastDay = (date: string) => date < today
  const isPastSlot = (date: string, hour: number) => date < today || (date === today && hour < Number(nowParts.time.slice(0, 2)))

  function dropProps(key: string, allowed: boolean, target: (post: PostRecord) => { date: string; time: string }) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!dragId || !allowed) return
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        if (dropKey !== key) setDropKey(key)
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && dropKey === key) setDropKey(null)
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        const id = e.dataTransfer.getData("text/plain") || dragId
        endDrag()
        const post = items.find((p) => p.id === id)
        if (!post || !allowed) return
        const { date, time } = target(post)
        void move(post, date, time)
      },
    }
  }

  const currentTime = (post: PostRecord) => (post.scheduledAt ? utcToZonedParts(post.scheduledAt, timezone).time : DEFAULT_TIME)

  async function move(post: PostRecord, date: string, time: string) {
    const at = zonedTimeToUtc(date, time, timezone)
    if (!at) return
    if (post.scheduledAt && Date.parse(post.scheduledAt) === at.getTime()) return
    if (at.getTime() < Date.now() + 60_000) {
      setNotice({ kind: "error", text: "That time has already passed. Drop it on a later day or hour." })
      return
    }

    const previous = post
    setItems((list) => list.map((p) => (p.id === post.id ? { ...p, scheduledAt: at.toISOString(), timezone, status: "scheduled" } : p)))
    setPending((s) => new Set(s).add(post.id))
    const result = await reschedulePost({ campaignId: campaign.id, postId: post.id, date, time, timezone })
    setPending((s) => {
      const next = new Set(s)
      next.delete(post.id)
      return next
    })
    if (!result.ok) {
      // Zernio refused it: it's back to being a draft
      const now = result.post ?? previous
      setItems((list) => list.map((p) => (p.id === post.id ? now : p)))
      setNotice({ kind: "error", text: result.error })
      return
    }
    setItems((list) => list.map((p) => (p.id === post.id ? result.post : p)))
    setNotice({ kind: "ok", text: `${previous.scheduledAt ? "Moved" : "Scheduled"} “${post.title}” for ${formatInZone(at.toISOString(), timezone)}.` })
  }

  const chip = (entry: { post: PostRecord; time: string | null }, variant: "month" | "week" | "tray") => (
    <PostChip
      key={entry.post.id}
      entry={entry}
      variant={variant}
      pending={pending.has(entry.post.id)}
      dragging={dragId === entry.post.id}
      onOpen={() => setSelectedId(entry.post.id)}
      onDragStart={(e) => startDrag(e, entry.post)}
      onDragEnd={endDrag}
    />
  )

  const nothingAtAll = !items.some((p) => p.status !== "archived")

  return (
    <div className="flex flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-end gap-4 animate-in fade-in duration-300">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold tracking-tight">Calendar</h2>
          <p className="mt-1 text-sm text-muted-foreground">Everything scheduled for {campaign.name}. Drag a post to move it to another day or time.</p>
        </div>
        <CreatePostMenu size="default" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm">
        <Button variant="outline" size="sm" onClick={() => setAnchor(today)}>
          Today
        </Button>
        <div className="flex">
          <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label={view === "month" ? "Previous month" : "Previous week"}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label={view === "month" ? "Next month" : "Next week"}>
            <ChevronRight />
          </Button>
        </div>
        <h3 key={title} className="min-w-0 flex-1 truncate text-base font-semibold animate-in fade-in slide-in-from-left-1 duration-300">
          {title}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {inRange} post{inRange === 1 ? "" : "s"}
          </span>
        </h3>
        <NativeSelect size="sm" value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value as PostPlatform | "all")} aria-label="Filter by platform">
          <NativeSelectOption value="all">All platforms</NativeSelectOption>
          {POST_PLATFORMS.map((p) => (
            <NativeSelectOption key={p} value={p}>
              {PLATFORMS[p].label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect size="sm" value={timezone} onChange={(e) => setTimezone(e.target.value)} aria-label="Time zone" className="max-w-44">
          {zones.length === 0 ? (
            <NativeSelectOption value={timezone}>{timezone.replace(/_/g, " ")}</NativeSelectOption>
          ) : (
            zones.map(({ zone, label }) => (
              <NativeSelectOption key={zone} value={zone}>
                {zone.replace(/_/g, " ")} ({label})
              </NativeSelectOption>
            ))
          )}
        </NativeSelect>
        <div className="inline-flex rounded-lg bg-muted p-[3px]">
          {(
            [
              ["month", CalendarDays, "Month"],
              ["week", CalendarRange, "Week"],
            ] as const
          ).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={cn("flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-foreground/60 transition-all", view === key && "bg-background text-foreground shadow-sm")}
            >
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <p
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm animate-in fade-in slide-in-from-top-1 duration-200",
            notice.kind === "ok" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-destructive/10 text-destructive"
          )}
        >
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </p>
      )}

      {nothingAtAll ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center animate-in fade-in zoom-in-[0.98] duration-500">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-lg shadow-amber-500/30">
            <CalendarDays className="size-6" />
          </span>
          <h3 className="mt-5 text-lg font-semibold">Your calendar is empty</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">Create a post or ask your AI agents to draft some. Scheduled posts show up here, and drafts wait in a tray to be dragged onto a day.</p>
          <div className="mt-5">
            <CreatePostMenu size="default" />
          </div>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="relative min-w-0">
            {view === "month" ? (
              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm animate-in fade-in duration-300">
                <div className="grid grid-cols-7 border-b bg-muted/40">
                  {days.slice(0, 7).map((d) => (
                    <div key={d.toISOString()} className="px-2 py-2 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                      <span className="sm:hidden">{format(d, "EEEEE")}</span>
                      <span className="hidden sm:inline">{format(d, "EEE")}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {days.map((d, i) => {
                    const key = dayKey(d)
                    const list = byDay.get(key) ?? []
                    const outside = !isSameMonth(d, anchorDay)
                    const past = isPastDay(key)
                    const droppable = !past
                    const over = dropKey === key
                    return (
                      <div
                        key={key}
                        {...dropProps(key, droppable, (post) => ({ date: key, time: currentTime(post) }))}
                        className={cn(
                          "flex min-h-24 flex-col gap-1 border-b p-1 transition-colors sm:min-h-32 sm:p-1.5",
                          i % 7 !== 6 && "border-r",
                          outside && "bg-muted/30",
                          past && "bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,var(--color-muted)_6px,var(--color-muted)_7px)]",
                          dragId && droppable && "bg-primary/[0.03]",
                          over && "bg-primary/10 ring-2 ring-primary/40 ring-inset"
                        )}
                      >
                        <div className="flex items-center justify-between px-0.5">
                          <span
                            className={cn(
                              "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                              key === today ? "bg-primary font-semibold text-primary-foreground" : outside ? "text-muted-foreground/60" : "text-muted-foreground"
                            )}
                          >
                            {format(d, "d")}
                          </span>
                        </div>
                        {list.slice(0, MONTH_VISIBLE).map((e) => chip(e, "month"))}
                        {list.length > MONTH_VISIBLE && (
                          <button
                            type="button"
                            onClick={() => {
                              setAnchor(key)
                              setView("week")
                            }}
                            className="rounded px-1 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            +{list.length - MONTH_VISIBLE} more
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div ref={weekScroll} className="max-h-[70vh] overflow-auto rounded-2xl border bg-card shadow-sm animate-in fade-in duration-300">
                <div className="grid min-w-[52rem] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
                  {/* Day headers */}
                  <div className="sticky top-0 z-20 border-r border-b bg-card" />
                  {days.map((d, i) => {
                    const key = dayKey(d)
                    return (
                      <div key={key} className={cn("sticky top-0 z-20 flex flex-col items-center gap-0.5 border-b bg-card py-2", i < 6 && "border-r")}>
                        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{format(d, "EEE")}</span>
                        <span className={cn("flex size-7 items-center justify-center rounded-full text-sm tabular-nums", key === today ? "bg-primary font-semibold text-primary-foreground" : "")}>{format(d, "d")}</span>
                      </div>
                    )
                  })}
                  {/* Hour rows */}
                  {HOURS.map((h) => (
                    <div key={h} className="contents">
                      <div ref={h === FIRST_VISIBLE_HOUR ? firstHourRow : undefined} className="border-r border-b px-1.5 pt-1 text-right text-[10px] text-muted-foreground tabular-nums">
                        {hourLabel(h)}
                      </div>
                      {days.map((d, i) => {
                        const key = dayKey(d)
                        const slot = `${key}T${h}`
                        const entries = (byDay.get(key) ?? []).filter((e) => Number(e.time.slice(0, 2)) === h)
                        const past = isPastSlot(key, h)
                        const over = dropKey === slot
                        const nowLine = key === today && Number(nowParts.time.slice(0, 2)) === h
                        return (
                          <div
                            key={slot}
                            {...dropProps(slot, !past, (post) => ({ date: key, time: `${String(h).padStart(2, "0")}:${post.scheduledAt ? currentTime(post).slice(3) : "00"}` }))}
                            className={cn(
                              "relative flex min-h-16 flex-col gap-1 border-b p-1 transition-colors",
                              i < 6 && "border-r",
                              past && "bg-muted/40",
                              key === today && !past && "bg-primary/[0.02]",
                              dragId && !past && "hover:bg-primary/5",
                              over && "bg-primary/10 ring-2 ring-primary/40 ring-inset"
                            )}
                          >
                            {nowLine && (
                              <span className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: `${(Number(nowParts.time.slice(3)) / 60) * 100}%` }}>
                                <span className="-ml-1 size-2 rounded-full bg-red-500" />
                                <span className="h-px flex-1 bg-red-500" />
                              </span>
                            )}
                            {entries.map((e) => chip(e, "week"))}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {inRange === 0 && (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center">
                <p className="rounded-full border bg-background/90 px-4 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
                  Nothing scheduled this {view}
                  {drafts.length ? ". Drag a draft here to schedule it." : "."}
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {(["scheduled", "publishing", "published", "failed"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", STATUS_STYLE[s].dot)} /> {STATUS_STYLE[s].label.replace("…", "")}
                </span>
              ))}
              <span className="ml-auto">
                Times in {timezone.replace(/_/g, " ")} ({zoneLabel(timezone)})
              </span>
            </div>
          </div>

          {/* Drafts waiting for a date */}
          <aside className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start">
            <div className="flex items-center gap-2 px-1">
              <Inbox className="size-4 text-muted-foreground" />
              <h3 className="flex-1 text-sm font-semibold">Unscheduled</h3>
              <span className="text-xs text-muted-foreground tabular-nums">{drafts.length}</span>
            </div>
            {drafts.length === 0 ? (
              <p className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">No drafts waiting. New drafts from you or your agents appear here.</p>
            ) : (
              <>
                <p className="px-1 text-[11px] text-muted-foreground">Drag a draft onto a day or hour to schedule it.</p>
                <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-x-visible xl:overflow-y-auto">
                  {drafts.map((post) => (
                    <div key={post.id} className="w-56 shrink-0 xl:w-auto">
                      {chip({ post, time: null }, "tray")}
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <PostDetailSheet
        post={selected}
        campaign={campaign}
        accounts={accounts}
        timezone={timezone}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onDeleted={(id) => {
          setSelectedId(null)
          setItems((list) => list.filter((p) => p.id !== id))
          setNotice({ kind: "ok", text: "Post deleted." })
        }}
      />
    </div>
  )
}
