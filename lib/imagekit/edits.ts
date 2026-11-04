import { z } from "zod"

/*
 * ImageKit AI transformations (https://imagekit.io/docs/ai-transformations), described once and
 * shared by the Edit Image dialog, the /api/posts/media routes and the agents' image tools.
 * Safe to import from client code.
 */

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
export const PLATFORM_PRESETS = Object.keys(PLATFORM_SIZES) as [PlatformPreset, ...PlatformPreset[]]

export const PRESET_LABELS: Record<PlatformPreset, string> = {
  instagram_square: "Instagram square",
  instagram_portrait: "Instagram portrait",
  story_reel: "Story / Reel",
  tiktok: "TikTok",
  youtube_thumbnail: "YouTube thumbnail",
  x_post: "X post",
  linkedin_post: "LinkedIn post",
  facebook_post: "Facebook post",
  pinterest_pin: "Pinterest pin",
}

export const TEXT_POSITIONS = ["top", "center", "bottom"] as const
export type TextPosition = (typeof TEXT_POSITIONS)[number]

export const IMAGE_EDIT_OPERATIONS = [
  "remove_background",
  "change_background",
  "edit",
  "generate_variation",
  "retouch",
  "upscale",
  "drop_shadow",
  "extend",
  "smart_crop",
  "face_crop",
  "platform_size",
  "add_text",
] as const
export type ImageEditOperation = (typeof IMAGE_EDIT_OPERATIONS)[number]

export type ImageEdit =
  | { operation: "remove_background" | "generate_variation" | "retouch" | "upscale" | "drop_shadow" }
  | { operation: "change_background" | "edit"; prompt: string }
  | { operation: "extend"; width: number; height: number; prompt?: string | null }
  | { operation: "smart_crop" | "face_crop"; width: number; height: number }
  | { operation: "platform_size"; preset: PlatformPreset }
  | { operation: "add_text"; text: string; position: TextPosition }

type Param = "prompt" | "size" | "preset" | "text"

export type EditInfo = {
  label: string
  description: string
  group: "ai" | "layout"
  // Inputs the operation needs; optionalPrompt marks a prompt that may be left empty
  params: Param[]
  optionalPrompt?: boolean
  placeholder?: string
}

export const EDIT_CATALOG: Record<ImageEditOperation, EditInfo> = {
  remove_background: { label: "Remove background", description: "Cut out the subject on a transparent background.", group: "ai", params: [] },
  change_background: {
    label: "Change background",
    description: "Keep the subject and replace the background from a prompt.",
    group: "ai",
    params: ["prompt"],
    placeholder: "e.g. a sunny beach at golden hour",
  },
  edit: {
    label: "Edit with a prompt",
    description: "Describe a change and the AI edits the image.",
    group: "ai",
    params: ["prompt"],
    placeholder: "e.g. add a red ribbon around the box",
  },
  generate_variation: { label: "Generate variation", description: "A new take on the same image.", group: "ai", params: [] },
  retouch: { label: "Retouch", description: "Improve quality: sharpen, fix blemishes and lighting.", group: "ai", params: [] },
  upscale: { label: "Upscale", description: "Increase resolution (up to 16 MP).", group: "ai", params: [] },
  drop_shadow: { label: "Drop shadow", description: "Add a realistic shadow under a cut-out subject.", group: "ai", params: [] },
  extend: {
    label: "Generative fill",
    description: "Extend the canvas to a new size and let AI fill the new area.",
    group: "layout",
    params: ["size", "prompt"],
    optionalPrompt: true,
    placeholder: "Optional: what to fill with",
  },
  smart_crop: { label: "Smart crop", description: "Crop to a size, keeping the most important part.", group: "layout", params: ["size"] },
  face_crop: { label: "Face crop", description: "Crop to a size, centered on the face.", group: "layout", params: ["size"] },
  platform_size: { label: "Resize for platform", description: "Smart-crop to a platform's standard size.", group: "layout", params: ["preset"] },
  add_text: { label: "Add text", description: "Overlay a short headline.", group: "layout", params: ["text"], placeholder: "e.g. 50% OFF this weekend" },
}

/** Loose input (API body or agent tool call): only the fields the operation needs are read. */
export const imageEditInputSchema = z.object({
  operation: z.enum(IMAGE_EDIT_OPERATIONS),
  prompt: z.string().trim().max(300).nullable().default(null),
  width: z.coerce.number().int().min(16).max(4000).nullable().default(null),
  height: z.coerce.number().int().min(16).max(4000).nullable().default(null),
  preset: z.enum(PLATFORM_PRESETS).nullable().default(null),
  text: z.string().trim().max(200).nullable().default(null),
  position: z.enum(TEXT_POSITIONS).nullable().default(null),
})
export type ImageEditInput = z.output<typeof imageEditInputSchema>

/** Turns loose input into an ImageEdit, or throws with what's missing. */
export function buildImageEdit(input: ImageEditInput): ImageEdit {
  const { operation } = input
  const size = () => {
    if (!input.width || !input.height) throw new Error(`${EDIT_CATALOG[operation].label} needs a width and height.`)
    return { width: input.width, height: input.height }
  }
  const prompt = () => {
    if (!input.prompt?.trim()) throw new Error(`${EDIT_CATALOG[operation].label} needs a prompt.`)
    return input.prompt.trim()
  }
  switch (operation) {
    case "change_background":
    case "edit":
      return { operation, prompt: prompt() }
    case "extend":
      return { operation, ...size(), prompt: input.prompt?.trim() || null }
    case "smart_crop":
    case "face_crop":
      return { operation, ...size() }
    case "platform_size":
      if (!input.preset) throw new Error(`Pick a platform size: ${PLATFORM_PRESETS.join(", ")}.`)
      return { operation, preset: input.preset }
    case "add_text":
      if (!input.text?.trim()) throw new Error("Add text needs the text to show.")
      return { operation, text: input.text.trim(), position: input.position ?? "bottom" }
    default:
      return { operation }
  }
}

export const ASPECT_RATIOS = ["1:1", "4:5", "9:16", "16:9"] as const
export type AspectRatio = (typeof ASPECT_RATIOS)[number]
