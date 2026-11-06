/*
 * Slideshow videos for Reels, TikTok and Shorts: still images with a slow zoom, crossfades, an
 * optional caption per slide and an optional music track, made with ffmpeg on the agent's
 * desktop (ffmpeg 4.4+ is preinstalled there). This file only builds the shell script; the tool
 * in lib/agents/tools/video.ts runs it.
 */

export const VIDEO_SIZES = {
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
} as const
export type VideoAspect = keyof typeof VIDEO_SIZES

export const MAX_SLIDES = 10
const FPS = 30
const FADE_SECONDS = 0.6
const FONT = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"
// Captions wrap at about this many characters per line
const LINE_CHARS = { "9:16": 22, "4:5": 24, "1:1": 24, "16:9": 40 } as const

export type Slide = { input: string; caption: string | null }
export type SlideshowSpec = {
  slides: Slide[]
  aspect: VideoAspect
  secondsPerSlide: number
  // A local audio file on the desktop, or null for a silent track
  music: string | null
  workDir: string
  output: string
}

const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`

/** Wraps a caption into short lines, at most 4, for drawtext (which doesn't wrap). */
export function wrapCaption(text: string, width: number) {
  // The font has no emoji: they'd show as empty boxes
  const plain = text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
  const words = plain.replace(/\s+/g, " ").trim().split(" ").filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  if (lines.length > 4) lines.splice(3, lines.length - 3, `${lines.slice(3).join(" ").slice(0, width - 1)}…`)
  return lines.join("\n")
}

export function slideshowLength(slides: number, secondsPerSlide: number) {
  return slides * secondsPerSlide - (slides - 1) * FADE_SECONDS
}

/**
 * The bash script: writes each caption to a file (so no text ever goes through ffmpeg's filter
 * escaping), then renders one MP4 (H.264 + AAC, faststart) that every platform accepts.
 */
export function slideshowScript(spec: SlideshowSpec) {
  const { width, height } = VIDEO_SIZES[spec.aspect]
  const n = spec.slides.length
  if (n < 1 || n > MAX_SLIDES) throw new Error(`A slideshow needs 1-${MAX_SLIDES} images.`)
  const seconds = spec.secondsPerSlide
  const frames = Math.round(seconds * FPS)
  const total = slideshowLength(n, seconds)
  const lines: string[] = ["set -e", `mkdir -p ${quote(spec.workDir)}`]

  const inputs: string[] = []
  const filters: string[] = []
  spec.slides.forEach((slide, i) => {
    inputs.push(`-i ${quote(slide.input)}`)
    // Fill the frame, upscale 2x so the zoom doesn't jitter, then zoom in slowly toward the center
    let chain =
      `[${i}:v]scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,crop=${width * 2}:${height * 2},setsar=1,` +
      `zoompan=z='min(zoom+0.0007,1.10)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${FPS}`
    if (slide.caption?.trim()) {
      const file = `${spec.workDir}/caption-${i}.txt`
      // Single-quoted for the shell, and read from a file by ffmpeg: no escaping problems
      lines.push(`printf '%s' ${quote(wrapCaption(slide.caption, LINE_CHARS[spec.aspect]))} > ${quote(file)}`)
      const size = Math.round(width / 15)
      chain +=
        `,drawtext=fontfile=${FONT}:textfile=${file}:expansion=none:fontcolor=white:fontsize=${size}:line_spacing=${Math.round(size / 4)}` +
        `:box=1:boxcolor=black@0.5:boxborderw=${Math.round(size / 2.5)}:x=(w-text_w)/2:y=h*0.70-text_h/2`
    }
    filters.push(`${chain},format=yuv420p[v${i}]`)
  })

  // Crossfade each slide into the next
  let last = "v0"
  for (let i = 1; i < n; i++) {
    const out = i === n - 1 ? "vout" : `x${i}`
    filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE_SECONDS}:offset=${(i * (seconds - FADE_SECONDS)).toFixed(2)}[${out}]`)
    last = out
  }
  const videoOut = n === 1 ? "v0" : "vout"

  // Music loops and fades out at the end; without music a silent track keeps every platform happy
  const audioIndex = n
  if (spec.music) {
    inputs.push(`-stream_loop -1 -i ${quote(spec.music)}`)
    filters.push(`[${audioIndex}:a]atrim=0:${total.toFixed(2)},afade=t=out:st=${Math.max(total - 1.5, 0).toFixed(2)}:d=1.5[aout]`)
  } else {
    inputs.push(`-f lavfi -t ${total.toFixed(2)} -i anullsrc=channel_layout=stereo:sample_rate=44100`)
  }
  const audioMap = spec.music ? "[aout]" : `${audioIndex}:a`

  const filterFile = `${spec.workDir}/filters.txt`
  lines.push(`printf '%s' ${quote(filters.join(";\n"))} > ${quote(filterFile)}`)
  lines.push(
    [
      "ffmpeg -y -hide_banner -loglevel error",
      ...inputs,
      `-filter_complex_script ${quote(filterFile)}`,
      `-map '[${videoOut}]' -map ${quote(audioMap)}`,
      `-t ${total.toFixed(2)} -r ${FPS}`,
      "-c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p -profile:v high",
      "-c:a aac -b:a 128k -ar 44100 -movflags +faststart",
      quote(spec.output),
    ].join(" ")
  )
  return { script: lines.join("\n"), seconds: total }
}
