import { getEmbeddedFrame } from "@/lib/office-scene"

// Serves character animation frames embedded as base64 in the /office-studio scene files
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ office: string; seat: string; frame: string }> }
) {
  const { office, seat, frame } = await params
  const image = await getEmbeddedFrame(office, Number(seat), Number(frame))
  if (!image) return new Response("Not found", { status: 404 })

  return new Response(new Uint8Array(image.body), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  })
}
