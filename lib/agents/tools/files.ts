import "server-only"
import { MASTER_KEY } from "@/lib/agent-roles"
import { FOLDERS, mimeFor } from "@/lib/computers/desktop"
import { safeFileName, uploadToImageKit } from "@/lib/computers/imagekit"
import type { StoredImage } from "@/lib/imagekit/tools"
import { fileName, homePath, isImage } from "./links"
import { campaignFolder, desktop, type RunMemory, type Session } from "./session"

/* Saving files and images the agent made, so they show in the task's results. */

/** Uploads a file from the desktop (once per path per attempt) and records it as a task result. */
export async function uploadFromDesktop(session: Session, memory: RunMemory, path: string, source: "uploaded" | "generated" | "edited") {
  const full = homePath(path)
  if (!full) throw new Error(`"${path}" is outside your home folder.`)
  if (memory.uploads[full]) return memory.uploads[full]
  const bytes = await (await desktop(session)).files.read(full, { format: "bytes" })
  const name = fileName(full)
  const mimeType = mimeFor(name)
  const file = await uploadToImageKit(bytes, {
    fileName: safeFileName(name),
    folder: campaignFolder(session),
    mimeType: mimeType ?? undefined,
  })
  memory.uploads[full] = file.url
  if (isImage(name, mimeType)) memory.images = [...(memory.images ?? []), file.url]
  await session.computers.addArtifact({
    taskId: session.task.id,
    agentKey: session.agentKey,
    kind: isImage(name, mimeType) ? "image" : "file",
    name,
    url: file.url,
    mimeType,
    sizeBytes: file.size,
    source,
  })
  return file.url
}

/**
 * Tells the user right away that an image is ready: a message with its link in the Master Agent
 * chat and in the agent's own chat, which the chat shows as a small preview. Best effort.
 */
async function announceImage(session: Session, url: string, source: "generated" | "edited") {
  const content = `${source === "generated" ? "Generated a new image" : "Edited an image"} for "${session.task.title}". It's saved in storage.\n${url}`
  const meta = { kind: "update" as const, content, requestId: session.task.requestId, taskId: session.task.id }
  await Promise.all([
    session.agents.addMessage({ thread: MASTER_KEY, sender: session.agentKey, recipient: "user", ...meta }),
    session.agents.addMessage({ thread: session.agentKey, sender: session.agentKey, recipient: MASTER_KEY, ...meta }),
  ]).catch((error) => console.error("Could not post the image preview", error))
}

/**
 * Records an image the agent made (generated or edited, already stored) as a task result and
 * announces it. Also copies it to the desktop when the desktop is already running, so later steps
 * can use the file.
 */
export async function recordImage(
  session: Session,
  memory: RunMemory,
  image: StoredImage,
  { folder, source }: { folder: keyof typeof FOLDERS; source: "generated" | "edited" }
) {
  const safe = safeFileName(image.name)
  memory.images = [...(memory.images ?? []), image.url]
  await session.computers.addArtifact({
    taskId: session.task.id,
    agentKey: session.agentKey,
    kind: "image",
    name: safe,
    url: image.url,
    mimeType: image.mimeType,
    sizeBytes: image.size,
    source,
  })
  await announceImage(session, image.url, source)
  let path: string | null = null
  if (session.sandbox) {
    path = `${FOLDERS[folder]}/${safe}`
    const { bytes } = image
    await session.sandbox.files
      .write(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
      .catch(() => (path = null))
    if (path) memory.uploads[path] = image.url
  }
  return { url: image.url, path }
}
