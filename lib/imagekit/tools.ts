import "server-only"
import { z } from "zod"
import { lenientTool } from "@/lib/ai/lenient-tool"
import { generateImage, type GeneratedImage, type ImageProvider } from "@/lib/computers/images"
import {
  fetchWhenReady,
  imageKitConfigured,
  isImageKitUrl,
  safeFileName,
  transformation,
  transformedUrl,
  uploadToImageKit,
} from "@/lib/computers/imagekit"
import {
  ASPECT_RATIOS,
  EDIT_CATALOG,
  IMAGE_EDIT_OPERATIONS,
  PLATFORM_PRESETS,
  buildImageEdit,
  imageEditInputSchema,
  type AspectRatio,
  type ImageEdit,
} from "@/lib/imagekit/edits"

/*
 * Image work shared by the Create Post page (/api/posts/media) and the AI agents:
 * generate, edit (ImageKit AI) and store images, each returning a permanent URL.
 * createImageTools() wraps the same functions as agent tools.
 */

export type StoredImage = {
  url: string
  fileId: string
  name: string
  size: number
  mimeType: string
  bytes: Uint8Array
}

export const extFor = (mimeType: string) => (mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png")
const baseName = (name: string) => safeFileName(name).replace(/\.\w+$/, "") || "image"
const fileNameOf = (url: string) => {
  try {
    return new URL(url).pathname.split("/").pop() || "image"
  } catch {
    return "image"
  }
}

/** Stores image bytes and returns the permanent URL. */
export async function storeImage(bytes: Uint8Array, { name, mimeType, folder }: { name: string; mimeType: string; folder: string }): Promise<StoredImage> {
  const file = await uploadToImageKit(bytes, { fileName: `${baseName(name)}.${extFor(mimeType)}`, folder, mimeType })
  return { url: file.url, fileId: file.fileId, name: file.name, size: file.size, mimeType, bytes }
}

/** Generates an image (first working provider) and stores it. */
export async function generateAndStoreImage({
  prompt,
  aspectRatio = "1:1",
  fileName = "generated",
  folder,
  prefer,
}: {
  prompt: string
  aspectRatio?: AspectRatio
  fileName?: string
  folder: string
  // Provider to try first; the others are fallbacks
  prefer?: ImageProvider
}): Promise<StoredImage & { provider: GeneratedImage["provider"]; square: boolean }> {
  const image = await generateImage(prompt, aspectRatio, prefer)
  const stored = await storeImage(image.bytes, { name: fileName, mimeType: image.mimeType, folder })
  return { ...stored, provider: image.provider, square: Boolean(image.square) }
}

/** Copies an image into ImageKit when needed: AI transformations only work on its own files. */
export async function ensureImageKitUrl(url: string, folder: string) {
  if (isImageKitUrl(url)) return url
  return (await uploadToImageKit(url, { fileName: safeFileName(fileNameOf(url)), folder })).url
}

/** Applies one ImageKit transformation and stores the result as a new file. */
export async function editAndStoreImage({
  imageUrl,
  edit,
  fileName,
  folder,
}: {
  imageUrl: string
  edit: ImageEdit
  fileName?: string
  folder: string
}): Promise<StoredImage> {
  if (!imageKitConfigured()) throw new Error("Image edits need ImageKit (IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT).")
  const source = await ensureImageKitUrl(imageUrl, folder)
  const result = await fetchWhenReady(transformedUrl(source, transformation(edit)))
  const name = fileName ?? `${baseName(fileNameOf(source))}-${edit.operation.replace(/_/g, "-")}`
  return storeImage(result.bytes, { name, mimeType: result.mimeType, folder })
}

// ---- Agent tools ----

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))

export type ImageToolHooks<C> = {
  /** ImageKit/storage folder for this agent's files. */
  folder: string
  /** Turns the agent's image reference (e.g. a path on its computer) into a URL. Default: URLs only. */
  resolveImage?: (ref: string, ctx: C | undefined) => Promise<string>
  /** Called with every new image, e.g. to record it as a task result. Returns extra text for the model. */
  onImage?: (image: StoredImage, source: "generated" | "edited", ctx: C | undefined) => Promise<string | void>
  /** Short status line while working ("Generating an image"). */
  onActivity?: (activity: string) => Promise<void>
  needsApproval?: () => Promise<boolean>
  errorFunction?: (ctx: unknown, error: unknown) => string
}

const asHttpUrl = async (ref: string) => {
  const url = new URL(ref.trim())
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Give the image as an http(s) URL.")
  return url.toString()
}

/** generate_image and edit_image, ready to give to any agent. */
export function createImageTools<C = unknown>(hooks: ImageToolHooks<C>) {
  const { folder, onActivity, errorFunction } = hooks
  const resolveImage = hooks.resolveImage ?? asHttpUrl
  const needsApproval = hooks.needsApproval ? () => hooks.needsApproval!() : undefined

  const generate = lenientTool({
    errorFunction,
    name: "generate_image",
    needsApproval,
    description: "Generate a new image from a detailed prompt. Returns its permanent URL; it's also shown with your results.",
    parameters: z.object({
      prompt: z.string().min(1).describe("Detailed: subject, style, colors, composition, any text to show"),
      aspect_ratio: z.enum(ASPECT_RATIOS).catch("1:1"),
      file_name: z.string().default("image").describe("e.g. launch-teaser.png"),
    }),
    execute: async ({ prompt, aspect_ratio, file_name }, ctx) => {
      try {
        await onActivity?.("Generating an image")
        const image = await generateAndStoreImage({ prompt, aspectRatio: aspect_ratio, fileName: file_name, folder })
        const extra = (await hooks.onImage?.(image, "generated", ctx?.context as C | undefined)) || ""
        const reshape =
          image.square && aspect_ratio !== "1:1" && imageKitConfigured()
            ? ` The image is square: to get ${aspect_ratio}, call edit_image with operation "extend" (to keep everything) or "platform_size" (to crop) on this URL.`
            : ""
        return `Generated with ${image.provider}. URL: ${image.url}${extra}.${reshape}`
      } catch (error) {
        return `Image generation failed: ${errorText(error)}`
      }
    },
  })

  const operations = IMAGE_EDIT_OPERATIONS.map((op) => `${op} (${EDIT_CATALOG[op].description.replace(/\.$/, "")})`).join("; ")
  const edit = lenientTool({
    errorFunction,
    name: "edit_image",
    needsApproval,
    description: `Transform an image with ImageKit AI. Operations: ${operations}. size = width + height; preset is one of ${PLATFORM_PRESETS.join(", ")}. Returns the new image's permanent URL.`,
    parameters: imageEditInputSchema.extend({
      image: z.string().describe("An image URL or a path on your computer"),
      file_name: z.string().default("edited-image"),
    }),
    execute: async (input, ctx) => {
      if (!imageKitConfigured()) {
        return "Image edits aren't available (ImageKit isn't set up). Use the image as is, and mention any resizing or text overlay it still needs in the draft's notes."
      }
      try {
        const op = buildImageEdit(input)
        await onActivity?.(`Editing an image (${EDIT_CATALOG[op.operation].label.toLowerCase()})`)
        const imageUrl = await resolveImage(input.image, ctx?.context as C | undefined)
        const image = await editAndStoreImage({ imageUrl, edit: op, fileName: input.file_name, folder })
        const extra = (await hooks.onImage?.(image, "edited", ctx?.context as C | undefined)) || ""
        return `Edited. URL: ${image.url}${extra}`
      } catch (error) {
        return `Image edit failed: ${errorText(error)}`
      }
    },
  })

  return { generate, edit }
}
