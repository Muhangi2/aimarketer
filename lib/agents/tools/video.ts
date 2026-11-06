import "server-only"
import { z } from "zod"
import { MASTER_KEY } from "@/lib/agent-roles"
import { lenientTool } from "@/lib/ai/lenient-tool"
import { FOLDERS, runShell, shellQuote } from "@/lib/computers/desktop"
import { MAX_SLIDES, VIDEO_SIZES, slideshowScript, type VideoAspect } from "@/lib/computers/slideshow"
import { uploadFromDesktop } from "./files"
import { homePath, httpUrl } from "./links"
import { OUT_OF_ACTIONS, desktop, errorText, memoryOf, outOfActions, pauseGate, setActivity, toolError, type Session } from "./session"

/*
 * Creator Agent video tool: make_video turns images into an MP4 slideshow (slow zoom, crossfades,
 * captions, optional music) with ffmpeg on the agent's desktop, then stores it like any other file.
 */

const RENDER_TIMEOUT_MS = 180_000
const DOWNLOAD_TIMEOUT_S = 30
const MAX_DOWNLOAD_BYTES = 30 * 1024 * 1024

/** Gets an image or audio file onto the desktop: a URL is downloaded, a desktop path is used as is. */
async function localFile(session: Session, ref: string, target: string) {
  const url = httpUrl(ref)
  if (!url) {
    const path = homePath(ref)
    if (!path) throw new Error(`"${ref}" is not a URL or a file in your home folder.`)
    return path
  }
  const sandbox = await desktop(session)
  const r = await runShell(
    sandbox,
    `curl -fsSL --max-time ${DOWNLOAD_TIMEOUT_S} --max-filesize ${MAX_DOWNLOAD_BYTES} -o ${shellQuote(target)} ${shellQuote(url)}`,
    (DOWNLOAD_TIMEOUT_S + 10) * 1000
  )
  if (r.exitCode !== 0) throw new Error(`Couldn't download ${url}: ${r.stderr.trim().slice(0, 160) || `curl exit ${r.exitCode}`}`)
  return target
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "video"

/** Tells the user the video is ready, in the Master Agent chat and the agent's own chat. Best effort. */
async function announceVideo(session: Session, url: string, seconds: number) {
  const content = `Made a ${Math.round(seconds)}-second video for "${session.task.title}". It's saved in storage.\n${url}`
  const meta = { kind: "update" as const, content, requestId: session.task.requestId, taskId: session.task.id }
  await Promise.all([
    session.agents.addMessage({ thread: MASTER_KEY, sender: session.agentKey, recipient: "user", ...meta }),
    session.agents.addMessage({ thread: session.agentKey, sender: session.agentKey, recipient: MASTER_KEY, ...meta }),
  ]).catch((error) => console.error("Could not post the video message", error))
}

export function makeVideoTool(session: Session) {
  return lenientTool({
    errorFunction: toolError,
    name: "make_video",
    needsApproval: pauseGate(session),
    description:
      "Turn 1-10 images into an MP4 slideshow video for Reels, TikTok or YouTube Shorts: each image slowly zooms, crossfades into the next, and can have a short caption on screen. Make the images first with generate_image (aspect 9:16 for Reels, TikTok and Shorts). Returns the video URL: save it with save_content_draft as video_url.",
    parameters: z.object({
      title: z.string().min(1).describe("Short name for the video, e.g. 'Puppy tips reel'"),
      images: z.array(z.string()).min(1).max(MAX_SLIDES).describe("Image URLs (from generate_image or edit_image) in order"),
      captions: z
        .array(z.string())
        .default([])
        .describe("On-screen text for each image, same order, under 12 words each. Use an empty string for no text on a slide."),
      aspect: z.enum(Object.keys(VIDEO_SIZES) as [VideoAspect, ...VideoAspect[]]).catch("9:16").describe("9:16 for Reels, TikTok and Shorts"),
      seconds_per_slide: z.number().min(1.5).max(8).catch(3),
      music_url: z.string().nullable().default(null).describe("Optional: URL of an MP3 or M4A the user provided. Leave null for a silent video."),
    }),
    execute: async (input, ctx) => {
      const memory = memoryOf(ctx)
      if (outOfActions(memory)) return OUT_OF_ACTIONS
      const name = `${slug(input.title)}-${Date.now().toString(36)}`
      const workDir = `${FOLDERS.output}/${name}`
      const output = `${FOLDERS.output}/${name}.mp4`
      try {
        const sandbox = await desktop(session)
        await setActivity(session, `Making a video: ${input.title.slice(0, 50)}`)
        await runShell(sandbox, `mkdir -p ${shellQuote(workDir)}`)
        const slides = []
        for (const [i, ref] of input.images.entries()) {
          slides.push({ input: await localFile(session, ref, `${workDir}/slide-${i}`), caption: input.captions[i]?.trim() || null })
        }
        const music = input.music_url?.trim() ? await localFile(session, input.music_url, `${workDir}/music`) : null
        const { script, seconds } = slideshowScript({ slides, aspect: input.aspect, secondsPerSlide: input.seconds_per_slide, music, workDir, output })
        await sandbox.files.write(`${workDir}/render.sh`, script)
        const r = await runShell(sandbox, `bash ${shellQuote(`${workDir}/render.sh`)}`, RENDER_TIMEOUT_MS)
        if (r.exitCode !== 0) {
          return `The video couldn't be made: ${(r.stderr || r.stdout).trim().slice(-300) || `exit ${r.exitCode}`}. Check that every image URL works, then try again.`
        }
        const url = await uploadFromDesktop(session, memory, output, "generated")
        memory.videos = [...(memory.videos ?? []), url]
        await announceVideo(session, url, seconds)
        await runShell(sandbox, `rm -rf ${shellQuote(workDir)}`).catch(() => undefined)
        return `Made a ${seconds.toFixed(1)}-second ${input.aspect} video with ${slides.length} slide${slides.length === 1 ? "" : "s"}: ${url}\nSave it with save_content_draft (video_url).`
      } catch (error) {
        return `The video couldn't be made: ${errorText(error)}`
      }
    },
  })
}
