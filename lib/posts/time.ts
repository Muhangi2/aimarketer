/* Wall-clock time in a time zone <-> UTC, with Intl only. Safe to import from client code. */

// Minutes the zone is ahead of UTC at that instant
function zoneOffsetMinutes(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60000)
}

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}

/** "2026-11-05" + "14:30" in "Africa/Kampala" -> the UTC Date of that moment. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string) {
  const [y, m, d] = date.split("-").map(Number)
  const [h, min] = time.split(":").map(Number)
  if ([y, m, d, h, min].some((n) => !Number.isFinite(n))) return null
  const wall = Date.UTC(y, m - 1, d, h, min)
  // Twice, so a guess that lands across a DST change settles on the right offset
  let utc = wall - zoneOffsetMinutes(wall, timeZone) * 60000
  utc = wall - zoneOffsetMinutes(utc, timeZone) * 60000
  return new Date(utc)
}

/** The UTC instant as wall-clock { date: "2026-11-05", time: "14:30" } in the zone (the reverse of zonedTimeToUtc). */
export function utcToZonedParts(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00"
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` }
}

export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

export function listTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone")
  } catch {
    return ["UTC"]
  }
}

/** "GMT+3" style label for a zone right now. */
export function zoneLabel(timeZone: string, at = Date.now()) {
  const minutes = zoneOffsetMinutes(at, timeZone)
  const sign = minutes >= 0 ? "+" : "-"
  const abs = Math.abs(minutes)
  return `GMT${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`
}

/** "Thu, Nov 5 · 2:30 PM" in the post's own zone. */
export function formatInZone(iso: string, timeZone: string | null, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? undefined,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...opts,
  }).format(new Date(iso))
}
