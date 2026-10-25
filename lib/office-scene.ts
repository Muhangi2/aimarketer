import "server-only"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"

// Shape of the AgentWorld Studio export in /office-studio
type SceneBundle = {
  office: { id: string; name: string; width: number; height: number; background: string }
  seats: {
    id: string
    label: string
    x: number
    y: number
    width: number
    zIndex: number
    character: {
      id: string
      name: string
      width: number
      height: number
      sprite: string
      animations?: Record<string, string[]>
    }
  }[]
}

export type OfficeSeat = {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  agentName: string
  frames: string[]
}

export type OfficeScene = {
  slug: string
  name: string
  width: number
  height: number
  // Region of the scene the background actually covers; seats use full-scene coordinates
  viewBox: { x: number; y: number; width: number; height: number }
  background: string
  seats: OfficeSeat[]
}

// Campaign office (picked during onboarding) -> scene file in /office-studio
const SCENES: Record<string, { slug: string; file: string }> = {
  "/offices/office-warm.png": { slug: "wooden", file: "wooden-office.json" },
  "/offices/office-blue.png": { slug: "modern", file: "modern-office.json" },
}
const DEFAULT_SCENE = SCENES["/offices/office-warm.png"]

const STUDIO_DIR = path.join(process.cwd(), "office-studio")
const PUBLIC_DIR = path.join(process.cwd(), "public")

// Parsed bundles are large (embedded PNG frames), so parse each file once per server process
const bundles = new Map<string, Promise<SceneBundle>>()

function loadBundle(file: string) {
  let bundle = bundles.get(file)
  if (!bundle) {
    bundle = readFile(path.join(STUDIO_DIR, file), "utf8").then((json) => JSON.parse(json) as SceneBundle)
    bundle.catch(() => bundles.delete(file))
    bundles.set(file, bundle)
  }
  return bundle
}

function seatFrames(seat: SceneBundle["seats"][number]) {
  const typing = seat.character.animations?.typing
  return typing?.length ? typing : [seat.character.sprite]
}

async function publicFileExists(urlPath: string) {
  const file = path.join(PUBLIC_DIR, decodeURIComponent(urlPath))
  if (!file.startsWith(PUBLIC_DIR)) return false
  return stat(file).then(
    (s) => s.isFile(),
    () => false
  )
}

// Width and height from a PNG's IHDR chunk
async function pngSize(urlPath: string) {
  try {
    const buf = await readFile(path.join(PUBLIC_DIR, decodeURIComponent(urlPath)))
    if (buf.toString("ascii", 12, 16) !== "IHDR") return null
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  } catch {
    return null
  }
}

export async function getOfficeScene(officeImage: string): Promise<OfficeScene> {
  const { slug, file } = SCENES[officeImage] ?? DEFAULT_SCENE
  const { office, seats } = await loadBundle(file)

  const background = (await publicFileExists(office.background)) ? office.background : officeImage

  // The editor draws the background with "meet" fitting, so a background whose aspect ratio
  // differs from the scene is letterboxed; crop the view to the area it covers
  const size = await pngSize(background)
  const scale = size ? Math.min(office.width / size.width, office.height / size.height) : 1
  const drawnWidth = size ? size.width * scale : office.width
  const drawnHeight = size ? size.height * scale : office.height
  const viewBox = {
    x: (office.width - drawnWidth) / 2,
    y: (office.height - drawnHeight) / 2,
    width: drawnWidth,
    height: drawnHeight,
  }

  const resolvedSeats = await Promise.all(
    seats.map(async (seat, seatIndex) => {
      const frames = (
        await Promise.all(
          seatFrames(seat).map(async (frame, frameIndex) => {
            if (frame.startsWith("data:image/")) return `/api/office-studio/${slug}/${seatIndex}/${frameIndex}`
            // Skip frames whose files are not in /public
            return (await publicFileExists(frame)) ? frame : null
          })
        )
      ).filter((f): f is string => f !== null)

      const { character } = seat
      return {
        id: seat.id,
        label: seat.label,
        x: seat.x,
        y: seat.y,
        width: seat.width,
        // Same sizing as the editor: keep the character's aspect ratio at the seat width
        height: character.width && character.height ? Math.round((seat.width * character.height) / character.width) : seat.width,
        zIndex: seat.zIndex,
        agentName: character.name,
        frames,
      }
    })
  )

  return {
    slug,
    name: office.name,
    width: office.width,
    height: office.height,
    viewBox,
    background,
    seats: resolvedSeats.filter((s) => s.frames.length > 0).sort((a, b) => a.zIndex - b.zIndex),
  }
}

export async function getEmbeddedFrame(slug: string, seatIndex: number, frameIndex: number) {
  const scene = Object.values(SCENES).find((s) => s.slug === slug)
  if (!scene) return null

  const { seats } = await loadBundle(scene.file)
  const seat = seats[seatIndex]
  const frame = seat ? seatFrames(seat)[frameIndex] : undefined
  const match = frame?.match(/^data:(image\/[\w+.-]+);base64,(.+)$/)
  if (!match) return null

  return { contentType: match[1], body: Buffer.from(match[2], "base64") }
}
