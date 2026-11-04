import type { SourceLink } from "@/lib/agents/types"
import { HOME, mimeFor } from "@/lib/computers/desktop"

/* URL, path and source-list helpers the tools share. */

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

export function httpUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null
  } catch {
    return null
  }
}

// "~/output/x.png" or "output/x.png" -> "/home/user/output/x.png"; null for anything outside the home folder
export function homePath(path: string) {
  const trimmed = path.trim().replace(/^~\//, `${HOME}/`)
  const absolute = trimmed.startsWith("/") ? trimmed : `${HOME}/${trimmed}`
  const parts: string[] = []
  for (const part of absolute.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") parts.pop()
    else parts.push(part)
  }
  const normalized = `/${parts.join("/")}`
  return normalized.startsWith(`${HOME}/`) ? normalized : null
}

export const fileName = (path: string) => path.split("/").pop() || "file"
export const isImage = (name: string, mime?: string | null) => (mime ?? mimeFor(name) ?? "").startsWith("image/")

export const URL_IN_TEXT = /https?:\/\/[^\s|<>"'`)\]]+/i

/** "https://x.com/a", "Title | https://x.com/a" or "Title (https://x.com/a)" -> { url, title }, deduped. */
export function parseSources(items: string[]): SourceLink[] {
  const seen = new Map<string, SourceLink>()
  for (const item of items.slice(0, 40)) {
    const match = item.match(URL_IN_TEXT)
    const url = httpUrl(match?.[0]?.replace(/[.,;:]+$/, ""))
    if (!url || seen.has(url)) continue
    const title = item.replace(match![0], " ").replace(/[|()[\]<>]+|\s[-–:]\s|[-–:]\s*$/g, " ").replace(/\s+/g, " ").trim()
    seen.set(url, { url, title: (title || hostOf(url)).slice(0, 200) })
  }
  return [...seen.values()].slice(0, 20)
}
