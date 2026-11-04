import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"
import { storeImage } from "@/lib/imagekit/tools"
import { postsFolder } from "@/lib/posts/store"

/*
 * Image upload for the Create Post page: multipart { campaignId, file }. Stored in ImageKit
 * (InsForge storage when ImageKit isn't set up) and returns the permanent URL.
 */

const MAX_BYTES = 10 * 1024 * 1024
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const campaignId = form?.get("campaignId")
  const file = form?.get("file")
  if (typeof campaignId !== "string" || !(file instanceof File)) return jsonError(400, "Choose an image to upload.")
  if (!TYPES.includes(file.type)) return jsonError(400, "Use a JPG, PNG, WebP or GIF image.")
  if (file.size > MAX_BYTES) return jsonError(400, "Images can be up to 10 MB.")

  const auth = await authorizeCampaign(campaignId)
  if (auth.error) return auth.error

  try {
    const image = await storeImage(new Uint8Array(await file.arrayBuffer()), { name: file.name, mimeType: file.type, folder: postsFolder(campaignId) })
    return Response.json({ url: image.url, name: image.name, size: image.size })
  } catch (error) {
    console.error("Post image upload failed", error)
    return jsonError(500, "Couldn't upload the image. Please try again.")
  }
}
