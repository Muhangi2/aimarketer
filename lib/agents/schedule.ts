import { addDays, addHours, addMonths, addWeeks } from "date-fns"
import { z } from "zod"
import type { RepeatRule } from "@/lib/agents/types"

// Shared by the server (planning, rescheduling) and the browser (labels)

// Tasks due within this window are dispatched right away instead of waiting for the next cron run
export const DISPATCH_WINDOW_MS = 15 * 60 * 1000
// Furthest ahead the Master Agent may schedule a task
export const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000

export const repeatRuleSchema = z.object({
  every: z.coerce.number().int().min(1).max(365),
  unit: z.enum(["hour", "day", "week", "month"]),
  count: z.coerce.number().int().min(1).max(365).optional(),
  until: z.string().optional().refine((v) => !v || !Number.isNaN(Date.parse(v)), "until must be a date"),
})

// Repeating more often than this would swamp the agents
const MIN_REPEAT_HOURS = 1

/** Milliseconds as an ISO string; the app's canonical timestamp format (millisecond precision). */
export const iso = (ms: number) => new Date(ms).toISOString()

function addInterval(from: Date, rule: RepeatRule) {
  const every = rule.unit === "hour" ? Math.max(rule.every, MIN_REPEAT_HOURS) : rule.every
  switch (rule.unit) {
    case "hour":
      return addHours(from, every)
    case "day":
      return addDays(from, every)
    case "week":
      return addWeeks(from, every)
    case "month":
      return addMonths(from, every)
  }
}

/**
 * The next occurrence after `scheduledAt`, stepping from the schedule (not from when the run
 * finished) so it never drifts, and skipping occurrences already in the past.
 * Returns null when the rule's count or end date is reached. `runCount` includes the run just done.
 */
export function nextOccurrence(rule: RepeatRule, scheduledAt: number, runCount: number, now = Date.now()) {
  if (rule.count && runCount >= rule.count) return null
  let next = addInterval(new Date(scheduledAt), rule)
  for (let i = 0; next.getTime() <= now && i < 10_000; i++) next = addInterval(next, rule)
  if (rule.until && next.getTime() > Date.parse(rule.until)) return null
  return next.getTime()
}

export function describeRepeat(rule: RepeatRule) {
  // "Every day", "Every 2 weeks"
  const base = `Every ${rule.every === 1 ? rule.unit : `${rule.every} ${rule.unit}s`}`
  if (rule.count) return `${base}, ${rule.count} times`
  if (rule.until) return `${base} until ${new Date(rule.until).toLocaleDateString()}`
  return base
}

// ---- Time zones (no extra dependency: Intl does the conversion) ----

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}

// How far the zone is ahead of UTC at the given instant, in milliseconds
function zoneOffset(instant: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value])
  )
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** The calendar date (y, m, d) of an instant in a zone. */
export function zonedDate(instant: number, timeZone: string) {
  const local = new Date(instant + zoneOffset(instant, timeZone))
  return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate() }
}

/** The instant a wall-clock time in a zone happens, e.g. 09:30 on Oct 27 in Africa/Kampala. */
export function zonedTimeToInstant(
  date: { year: number; month: number; day: number },
  hours: number,
  minutes: number,
  timeZone: string
) {
  const guess = Date.UTC(date.year, date.month, date.day, hours, minutes)
  const first = guess - zoneOffset(guess, timeZone)
  // Second pass corrects for a daylight-saving change between the guess and the answer
  return guess - zoneOffset(first, timeZone)
}

/** "Today 2:30 PM", "Tomorrow 9:00 AM", "Mon, Nov 3, 9:00 AM" in the given zone. */
export function formatWhen(instant: number, timeZone?: string, now = Date.now()) {
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : undefined
  if (instant <= now + 60_000) return "Now"
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(instant)
  const tz = zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const day = zonedDate(instant, tz)
  const today = zonedDate(now, tz)
  const diffDays = Math.round((Date.UTC(day.year, day.month, day.day) - Date.UTC(today.year, today.month, today.day)) / 86_400_000)
  if (diffDays === 0) return `Today ${time}`
  if (diffDays === 1) return `Tomorrow ${time}`
  const date = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric" }).format(instant)
  return `${date}, ${time}`
}
