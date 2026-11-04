import "server-only"
import { completeText } from "@/lib/ai/llm"

/*
 * Drafts a reply to a comment or DM for the user to review in the inbox. Nothing is sent
 * without the user approving it.
 */

export type ReplyDraftInput = {
  kind: "comment" | "message"
  platform: string
  brandName: string
  // The post the comment is on (caption), when replying to a comment
  postText: string | null
  // Oldest first; "them" is the follower or customer, "us" is the brand
  thread: { from: "them" | "us"; name: string | null; text: string }[]
  // Optional direction from the user, e.g. "offer a 10% code"
  instruction: string | null
}

const LIMITS: Record<string, number> = { youtube: 500, tiktok: 150, instagram: 300 }

export async function draftReply(input: ReplyDraftInput) {
  const maxChars = input.kind === "comment" ? (LIMITS[input.platform] ?? 300) : 600
  const thread = input.thread
    .slice(-12)
    .map((m) => `${m.from === "us" ? `${input.brandName} (us)` : m.name || "Them"}: ${m.text.slice(0, 1000)}`)
    .join("\n")

  const system = `You are the community manager for the brand "${input.brandName}", replying on ${input.platform}.
Write one reply to the last message from them, as the brand.
Rules:
- Friendly, human and on-brand. Answer what they asked; thank them for praise; stay calm and helpful with complaints.
- Never invent facts: prices, stock, dates, discounts, policies or links. If you don't know, say you'll check or invite them to DM.
- ${input.kind === "comment" ? `A public comment reply: one or two short sentences, under ${maxChars} characters. At most one emoji. No hashtags.` : `A direct message: short and conversational, under ${maxChars} characters.`}
- Reply with only the text of the reply. No quotes, no labels, no notes.`

  const context = [
    input.postText ? `The post they commented on:\n${input.postText.slice(0, 1500)}` : null,
    `The conversation so far:\n${thread}`,
    input.instruction ? `Direction from the brand owner for this reply: ${input.instruction.slice(0, 500)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n")

  const text = await completeText(
    [
      { role: "system", content: system },
      { role: "user", content: context },
    ],
    { temperature: 0.6 }
  )
  // Small models sometimes wrap the reply in quotes or add a label
  return text
    .replace(/^(reply|response)\s*:\s*/i, "")
    .replace(/^["“](.*)["”]$/s, "$1")
    .trim()
    .slice(0, maxChars)
}
