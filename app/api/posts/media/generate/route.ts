import { z } from "zod"
import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"
import { ASPECT_RATIOS } from "@/lib/imagekit/edits"
import { generateAndStoreImage } from "@/lib/imagekit/tools"
import { postsFolder } from "@/lib/posts/store"

/*
 * POST { campaignId, prompt, aspectRatio }: generates an image with ImageKit AI and stores it. The
 * agents' other providers (Gemini, Cloudflare, OpenAI) are fallbacks if ImageKit fails.
 */

export const maxDuration = 120

const schema = z.object({
  campaignId: z.string().uuid(),
  prompt: z.string().trim().min(3, "Describe the image you want.").max(1000),
  aspectRatio: z.enum(ASPECT_RATIOS).default("1:1"),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request")
  const { campaignId, prompt, aspectRatio } = parsed.data

  const auth = await authorizeCampaign(campaignId)
  if (auth.error) return auth.error

  try {
    const image = await generateAndStoreImage({ prompt, aspectRatio, fileName: "ai-image", folder: postsFolder(campaignId), prefer: "imagekit" })
    return Response.json({ url: image.url, provider: image.provider, square: image.square })
  } catch (error) {
    console.error("Post image generation failed", error)
    return jsonError(502, error instanceof Error ? error.message : "Couldn't generate the image.")
  }
}
