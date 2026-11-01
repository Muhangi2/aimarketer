import "server-only"
import OpenAI from "openai"
import { fetchWhenReady, generatedImageUrl, imageKitConfigured } from "@/lib/computers/imagekit"

/*
 * Image generation for the Creator Agent. IMAGE_PROVIDER picks the first provider to try
 * (gemini by default); the others are fallbacks, skipped when their keys aren't set.
 */

export type ImageProvider = "gemini" | "openai" | "imagekit"
export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9"

const PROVIDERS: ImageProvider[] = ["gemini", "openai", "imagekit"]
const GEMINI_MODEL = "gemini-2.5-flash-image"
const OPENAI_MODEL = "gpt-image-1"

export type GeneratedImage = { bytes: Uint8Array; mimeType: string; provider: ImageProvider }

function openAIImageKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  // The main model may already be OpenAI
  if (process.env.AI_BASE_URL?.includes("api.openai.com") && process.env.AI_API_KEY) return process.env.AI_API_KEY
  return null
}

function configured(provider: ImageProvider) {
  if (provider === "gemini") return Boolean(process.env.GEMINI_API_KEY)
  if (provider === "openai") return Boolean(openAIImageKey())
  return imageKitConfigured()
}

/** Providers to try, in order. */
export function providerOrder(): ImageProvider[] {
  const preferred = process.env.IMAGE_PROVIDER?.toLowerCase() as ImageProvider | undefined
  const first = preferred && PROVIDERS.includes(preferred) ? preferred : "gemini"
  return [first, ...PROVIDERS.filter((p) => p !== first)].filter(configured)
}

async function withGemini(prompt: string, aspect: AspectRatio): Promise<GeneratedImage> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect } },
    }),
  })
  const body = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[]
    error?: { message?: string }
  } | null
  if (!res.ok) throw new Error(`Gemini: ${body?.error?.message ?? res.status}`)
  const part = body?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
  if (!part?.inlineData?.data) throw new Error("Gemini returned no image.")
  return { bytes: Buffer.from(part.inlineData.data, "base64"), mimeType: part.inlineData.mimeType ?? "image/png", provider: "gemini" }
}

const OPENAI_SIZE: Record<AspectRatio, "1024x1024" | "1024x1536" | "1536x1024"> = {
  "1:1": "1024x1024",
  "4:5": "1024x1536",
  "9:16": "1024x1536",
  "16:9": "1536x1024",
}

async function withOpenAI(prompt: string, aspect: AspectRatio): Promise<GeneratedImage> {
  const client = new OpenAI({ apiKey: openAIImageKey()! })
  const res = await client.images.generate({ model: OPENAI_MODEL, prompt, size: OPENAI_SIZE[aspect], n: 1 })
  const b64 = res.data?.[0]?.b64_json
  if (!b64) throw new Error("OpenAI returned no image.")
  return { bytes: Buffer.from(b64, "base64"), mimeType: "image/png", provider: "openai" }
}

async function withImageKit(prompt: string): Promise<GeneratedImage> {
  const image = await fetchWhenReady(generatedImageUrl(prompt, `generated-${Date.now()}`))
  return { ...image, provider: "imagekit" }
}

/** Generates an image with the first provider that works. */
export async function generateImage(prompt: string, aspect: AspectRatio = "1:1"): Promise<GeneratedImage> {
  const order = providerOrder()
  if (order.length === 0) throw new Error("No image provider is set up (GEMINI_API_KEY, OPENAI_API_KEY or ImageKit).")
  const problems: string[] = []
  for (const provider of order) {
    try {
      if (provider === "gemini") return await withGemini(prompt, aspect)
      if (provider === "openai") return await withOpenAI(prompt, aspect)
      return await withImageKit(prompt)
    } catch (error) {
      problems.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(`Image generation failed. ${problems.join("; ")}`)
}
