/* Browser helpers for the /api/posts/media routes. Refreshes the session once if it expired. */

async function send(url: string, init: RequestInit) {
  let res = await fetch(url, init)
  if (res.status === 401 && (await fetch("/api/auth/refresh", { method: "POST" })).ok) res = await fetch(url, init)
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Something went wrong. Please try again.")
  return body ?? {}
}

/** Uploads an image or a video for a post. */
export async function uploadPostMedia(campaignId: string, file: File) {
  const form = new FormData()
  form.append("campaignId", campaignId)
  form.append("file", file)
  return (await send("/api/posts/media", { method: "POST", body: form })) as { url: string; kind: "image" | "video" }
}

export async function generatePostImage(campaignId: string, prompt: string, aspectRatio: string) {
  return (await send("/api/posts/media/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId, prompt, aspectRatio }),
  })) as { url: string; provider: string; square: boolean }
}

export async function editPostImage(campaignId: string, imageUrl: string, params: Record<string, unknown>) {
  return (await send("/api/posts/media/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId, imageUrl, ...params }),
  })) as { url: string; operation: string }
}

/** Small preview from ImageKit's on-the-fly resizing; other hosts get the original. */
export function thumbUrl(url: string, width = 480) {
  return url.includes("imagekit.io") && !/\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? `${url}${url.includes("?") ? "&" : "?"}tr=w-${width},c-at_max` : url
}
