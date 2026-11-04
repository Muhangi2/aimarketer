import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"
import { safeFileName, uploadToImageKit } from "@/lib/computers/imagekit"
import { storeImage } from "@/lib/imagekit/tools"
import { postsFolder } from "@/lib/posts/store"

/*
 * Image and video upload for the Create Post page: multipart { campaignId, file }. Stored in
 * ImageKit (InsForge storage when ImageKit isn't set up) and returns the permanent URL.
 */

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" }

// Videos can take a while to reach storage
export const maxDuration = 300

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const campaignId = form?.get("campaignId")
  const file = form?.get("file")
  if (typeof campaignId !== "string" || !(file instanceof File)) return jsonError(400, "Choose an image or video to upload.")

  const isVideo = file.type in VIDEO_TYPES
  if (!isVideo && !IMAGE_TYPES.includes(file.type)) return jsonError(400, "Use a JPG, PNG, WebP or GIF image, or an MP4, MOV or WebM video.")
  if (isVideo && file.size > MAX_VIDEO_BYTES) return jsonError(400, "Videos can be up to 100 MB.")
  if (!isVideo && file.size > MAX_IMAGE_BYTES) return jsonError(400, "Images can be up to 10 MB.")

  const auth = await authorizeCampaign(campaignId)
  if (auth.error) return auth.error

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (isVideo) {
      const base = safeFileName(file.name).replace(/\.[^.]+$/, "") || "video"
      const video = await uploadToImageKit(bytes, { fileName: `${base}.${VIDEO_TYPES[file.type]}`, folder: postsFolder(campaignId), mimeType: file.type })
      return Response.json({ url: video.url, name: video.name, size: video.size, kind: "video" })
    }
    const image = await storeImage(bytes, { name: file.name, mimeType: file.type, folder: postsFolder(campaignId) })
    return Response.json({ url: image.url, name: image.name, size: image.size, kind: "image" })
  } catch (error) {
    console.error("Post media upload failed", error)
    return jsonError(500, `Couldn't upload the ${isVideo ? "video" : "image"}. Please try again.`)
  }
}
