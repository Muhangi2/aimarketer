import { ExternalLink, FileText, Globe, Link2 } from "lucide-react"
import type { ArtifactRecord } from "@/lib/agents/types"

const SOURCE_LABEL: Record<ArtifactRecord["source"], string> = {
  generated: "Generated",
  edited: "Edited",
  uploaded: "Uploaded",
  reported: "Shared",
  visited: "Opened",
  campaign_end: "Saved at campaign end",
}

function formatSize(bytes: number | null) {
  if (!bytes) return null
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ImageKit resizes on the fly; other hosts get the original
function thumbnail(url: string) {
  return url.includes("imagekit.io") ? `${url}${url.includes("?") ? "&" : "?"}tr=w-240,h-240,c-at_max` : url
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

/** Files, images and links an agent made for a task, plus the pages it really opened. */
export function TaskArtifacts({ artifacts }: { artifacts: ArtifactRecord[] }) {
  if (artifacts.length === 0) return null
  const images = artifacts.filter((a) => a.kind === "image")
  const files = artifacts.filter((a) => a.kind === "file")
  const links = artifacts.filter((a) => a.kind === "link")
  const pages = artifacts.filter((a) => a.kind === "page")

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div>
          <p className="font-semibold text-muted-foreground">Images</p>
          <ul className="mt-1.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {images.map((image) => (
              <li key={image.id}>
                <a
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group block overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  title={`${image.name} · ${SOURCE_LABEL[image.source]}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbnail(image.url)}
                    alt={image.name}
                    loading="lazy"
                    className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </a>
                <p className="mt-1 truncate text-[10px] text-muted-foreground">{SOURCE_LABEL[image.source]}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <p className="font-semibold text-muted-foreground">Files</p>
          <ul className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {files.map((file) => (
              <li key={file.id}>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 rounded-lg border bg-background p-2 transition-colors hover:border-primary/40 hover:bg-accent/50"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileText className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{file.name}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {[SOURCE_LABEL[file.source], formatSize(file.sizeBytes)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {links.length > 0 && (
        <div>
          <p className="font-semibold text-muted-foreground">Sources</p>
          <ul className="mt-1 space-y-1">
            {links.map((link) => (
              <li key={link.id}>
                <a href={link.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-primary hover:underline">
                  <Link2 className="size-3 shrink-0" />
                  <span className="truncate">{link.name}</span>
                  <span className="shrink-0 text-muted-foreground">· {host(link.url)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pages.length > 0 && (
        <div>
          <p className="font-semibold text-muted-foreground">Pages opened on its computer</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {pages.map((page) => (
              <li key={page.id}>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                  title={page.url}
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] hover:border-primary/40"
                >
                  <Globe className="size-3 text-muted-foreground" /> {host(page.url)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const IMAGE_URL = /https?:\/\/[^\s<>"')]+?\.(?:png|jpe?g|webp|gif)(?:\?[^\s<>"')]*)?(?=[\s<>"')]|$)/gi

/** Image links written in a message's text (agents list their images as URLs). */
export function imageUrlsIn(text: string) {
  return [...new Set(text.match(IMAGE_URL) ?? [])]
}

/** A row of image thumbnails shown under a chat message; each opens the full image. */
export function ImageStrip({ urls, className }: { urls: string[]; className?: string }) {
  if (urls.length === 0) return null
  return (
    <ul className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${className ?? ""}`}>
      {urls.slice(0, 12).map((url) => (
        <li key={url}>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="group block overflow-hidden rounded-lg border bg-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnail(url)}
              alt="Image made by the agent"
              loading="lazy"
              className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </a>
        </li>
      ))}
    </ul>
  )
}
