import "server-only"
import { getInsForgeAdmin } from "@/lib/insforge/admin"

/*
 * ImageKit: permanent URLs for files agents make, and ImageKit AI image edits.
 * Needs IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT (e.g. https://ik.imagekit.io/your_id).
 */

const UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload"
// AI transformations are generated on the first request and can take a while
const READY_ATTEMPTS = 30
const READY_DELAY_MS = 3000

export class ImageKitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ImageKitError"
  }
}

export function imageKitConfigured() {
  return Boolean(process.env.IMAGEKIT_PRIVATE_KEY && process.env.IMAGEKIT_URL_ENDPOINT)
}

function config() {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT?.replace(/\/+$/, "")
  if (!privateKey || !endpoint) throw new ImageKitError("Image edits need ImageKit (IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT). Generated images are still saved without it.")
  return { privateKey, endpoint }
}

export function isImageKitUrl(url: string) {
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT?.replace(/\/+$/, "")
  return Boolean(endpoint && url.startsWith(`${endpoint}/`))
}

export type UploadedFile = { url: string; fileId: string; name: string; size: number; mimeType: string | null }

// Public InsForge bucket used when ImageKit isn't set up
const FALLBACK_BUCKET = "agent-files"

/** Stores the file in the project's InsForge storage and returns its public URL. */
async function uploadToInsForge(
  file: Uint8Array | string,
  { fileName, folder, mimeType }: { fileName: string; folder: string; mimeType?: string }
): Promise<UploadedFile> {
  let bytes: Uint8Array
  let type = mimeType
  if (typeof file === "string") {
    const res = await fetch(file)
    if (!res.ok) throw new ImageKitError(`Could not download ${file} (${res.status}).`)
    bytes = new Uint8Array(await res.arrayBuffer())
    type ??= res.headers.get("content-type")?.split(";")[0] ?? undefined
  } else {
    bytes = file
  }
  const name = safeFileName(fileName)
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const key = `${folder.replace(/^\/+|\/+$/g, "")}/${stamp}-${name}`
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: type ?? "application/octet-stream" })
  const { data, error } = await getInsForgeAdmin().storage.from(FALLBACK_BUCKET).upload(key, blob)
  if (error || !data?.url) throw new ImageKitError(`File upload failed: ${error?.message ?? "no URL returned"}`)
  return { url: data.url, fileId: data.key, name, size: data.size ?? bytes.byteLength, mimeType: type ?? null }
}

/**
 * Uploads bytes (or a public URL) and returns the file's permanent URL. Uses ImageKit when it's
 * set up (needed for AI image edits), otherwise the project's InsForge storage.
 */
export async function uploadToImageKit(
  file: Uint8Array | string,
  options: { fileName: string; folder: string; mimeType?: string }
): Promise<UploadedFile> {
  if (!imageKitConfigured()) return uploadToInsForge(file, options)
  const { fileName, folder, mimeType } = options
  const { privateKey } = config()
  const form = new FormData()
  // A string is a URL ImageKit downloads itself
  if (typeof file === "string") form.append("file", file)
  else form.append("file", new Blob([file as Uint8Array<ArrayBuffer>], { type: mimeType ?? "application/octet-stream" }), fileName)
  form.append("fileName", safeFileName(fileName))
  form.append("folder", folder)
  form.append("useUniqueFileName", "true")

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}` },
    body: form,
  })
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok || !body?.url) {
    throw new ImageKitError(`ImageKit upload failed (${res.status}): ${String(body?.message ?? "no details")}`)
  }
  return {
    url: String(body.url),
    fileId: String(body.fileId),
    name: String(body.name ?? fileName),
    size: Number(body.size ?? (typeof file === "string" ? 0 : file.byteLength)),
    mimeType: mimeType ?? null,
  }
}

export function safeFileName(name: string) {
  const cleaned = name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "")
  return cleaned.slice(-120) || "file"
}

// ---- AI transformations ----

// Text inside a transformation can't contain the separators ImageKit uses
function promptParam(text: string) {
  return encodeURIComponent(text.replace(/[,:/\\?&#]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300))
}

export type ImageEdit =
  | { operation: "remove_background" }
  | { operation: "change_background"; prompt: string }
  | { operation: "edit"; prompt: string }
  | { operation: "upscale" }
  | { operation: "extend"; width: number; height: number; prompt?: string | null }
  | { operation: "smart_crop"; width: number; height: number }
  | { operation: "add_text"; text: string; position: TextPosition }
  | { operation: "platform_size"; preset: PlatformPreset }

export type TextPosition = "top" | "center" | "bottom"

// Standard image sizes per platform placement
export const PLATFORM_SIZES = {
  instagram_square: { width: 1080, height: 1080 },
  instagram_portrait: { width: 1080, height: 1350 },
  story_reel: { width: 1080, height: 1920 },
  tiktok: { width: 1080, height: 1920 },
  youtube_thumbnail: { width: 1280, height: 720 },
  x_post: { width: 1600, height: 900 },
  linkedin_post: { width: 1200, height: 627 },
  facebook_post: { width: 1200, height: 630 },
  pinterest_pin: { width: 1000, height: 1500 },
} as const
export type PlatformPreset = keyof typeof PLATFORM_SIZES

export function transformation(edit: ImageEdit) {
  switch (edit.operation) {
    case "remove_background":
      return "e-bgremove"
    case "change_background":
      return `e-changebg-prompt-${promptParam(edit.prompt)}`
    case "edit":
      return `e-edit-prompt-${promptParam(edit.prompt)}`
    case "upscale":
      return "e-upscale"
    case "extend":
      return `w-${edit.width},h-${edit.height},cm-pad_resize,${edit.prompt ? `e-genfill-prompt-${promptParam(edit.prompt)}` : "e-genfill"}`
    case "smart_crop":
      return `w-${edit.width},h-${edit.height},fo-auto`
    case "platform_size": {
      const { width, height } = PLATFORM_SIZES[edit.preset]
      return `w-${width},h-${height},fo-auto`
    }
    case "add_text": {
      // Base64 text ("ie-") avoids clashes with ImageKit's separators
      const encoded = encodeURIComponent(Buffer.from(edit.text.slice(0, 200)).toString("base64"))
      return `l-text,ie-${encoded},fs-56,co-FFFFFF,bg-00000099,pa-24,w-bw_mul_0.85,lfo-${edit.position},l-end`
    }
  }
}

export function transformedUrl(url: string, tr: string) {
  return `${url}${url.includes("?") ? "&" : "?"}tr=${tr}`
}

/** URL of an image ImageKit AI generates from a prompt (served from the URL endpoint). */
export function generatedImageUrl(prompt: string, fileName: string) {
  const { endpoint } = config()
  return `${endpoint}/ik-genimg-prompt-${promptParam(prompt)}/${safeFileName(fileName).replace(/\.\w+$/, "")}.jpg`
}

/** Fetches an ImageKit URL until the (possibly still generating) image is ready. */
export async function fetchWhenReady(url: string) {
  let last = ""
  for (let i = 0; i < READY_ATTEMPTS; i++) {
    const res = await fetch(url, { cache: "no-store" })
    const type = res.headers.get("content-type") ?? ""
    if (res.ok && type.startsWith("image/")) {
      return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType: type.split(";")[0] }
    }
    last = `${res.status} ${type}`
    // 4xx other than "not ready yet" won't get better
    if (res.status >= 400 && res.status < 500 && res.status !== 404 && res.status !== 408 && res.status !== 429) break
    await new Promise((r) => setTimeout(r, READY_DELAY_MS))
  }
  throw new ImageKitError(`ImageKit could not produce the image (${last || "timed out"}).`)
}
