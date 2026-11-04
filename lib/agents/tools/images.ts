import "server-only"
import { HOME } from "@/lib/computers/desktop"
import { createImageTools } from "@/lib/imagekit/tools"
import { recordImage, uploadFromDesktop } from "./files"
import { httpUrl } from "./links"
import { campaignFolder, memoryOf, pauseGate, setActivity, toolError, type RunMemory, type Session } from "./session"

/*
 * Creator Agent image tools: generate_image (Gemini first, then the other providers) and
 * edit_image (ImageKit AI transforms). They're the same tools the Create Post page uses
 * (lib/imagekit/tools), with this agent's hooks: every image is stored, shown in the task's
 * results and announced in chat.
 */

export function imageTools(session: Session) {
  const { generate, edit } = createImageTools<RunMemory>({
    folder: campaignFolder(session),
    errorFunction: toolError,
    needsApproval: pauseGate(session),
    onActivity: (activity) => setActivity(session, activity),
    // A path on the desktop is uploaded first
    resolveImage: async (ref, memory) => httpUrl(ref) ?? (await uploadFromDesktop(session, memoryOf({ context: memory }), ref, "uploaded")),
    onImage: async (image, source, memory) => {
      const saved = await recordImage(session, memoryOf({ context: memory }), image, { folder: source === "generated" ? "assets" : "output", source })
      return saved.path ? ` (also saved to ${saved.path.replace(HOME, "~")})` : ""
    },
  })
  return { generateImage: generate, editImage: edit }
}
