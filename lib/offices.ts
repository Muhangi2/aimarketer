import "server-only"
import { readdir } from "node:fs/promises"
import path from "node:path"

export type Office = {
  src: string
  label: string
}

const OFFICES_DIR = path.join(process.cwd(), "public", "offices")
const IMAGE_EXT = /\.(png|jpe?g|webp|avif)$/i

// "office-warm.png" -> "Warm Office"
function toLabel(file: string) {
  const words = file
    .replace(IMAGE_EXT, "")
    .split(/[-_\s]+/)
    .filter((w) => w && w.toLowerCase() !== "office")
    .map((w) => w[0].toUpperCase() + w.slice(1))
  return `${words.join(" ")} Office`.trim()
}

export async function listOffices(): Promise<Office[]> {
  const files = await readdir(OFFICES_DIR).catch(() => [])
  return files
    .filter((f) => IMAGE_EXT.test(f))
    .sort()
    .map((f) => ({ src: `/offices/${f}`, label: toLabel(f) }))
}
