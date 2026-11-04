import { z } from "zod"
import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"
import { imageKitConfigured } from "@/lib/computers/imagekit"
import { buildImageEdit, imageEditInputSchema } from "@/lib/imagekit/edits"
import { editAndStoreImage } from "@/lib/imagekit/tools"
import { postsFolder } from "@/lib/posts/store"

/*
 * POST { campaignId, imageUrl, operation, ...params }: applies one ImageKit AI transformation
 * and saves the result as a new file. AI edits can take a while on first request.
 */

export const maxDuration = 120

const schema = imageEditInputSchema.extend({
  campaignId: z.string().uuid(),
  imageUrl: z.string().url(),
})

export async function GET() {
  return Response.json({ available: imageKitConfigured() })
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid request")
  const { campaignId, imageUrl, ...input } = parsed.data

  const auth = await authorizeCampaign(campaignId)
  if (auth.error) return auth.error
  if (!imageKitConfigured()) return jsonError(503, "Image editing needs ImageKit. Add IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT.")

  let edit
  try {
    edit = buildImageEdit(input)
  } catch (error) {
    return jsonError(400, error instanceof Error ? error.message : "Invalid edit")
  }

  try {
    const image = await editAndStoreImage({ imageUrl, edit, folder: postsFolder(campaignId) })
    return Response.json({ url: image.url, operation: edit.operation })
  } catch (error) {
    console.error("Post image edit failed", error)
    return jsonError(502, error instanceof Error ? error.message : "Couldn't edit the image.")
  }
}
