import "server-only"
import type { DraftFormat, SourceLink } from "@/lib/agents/types"
import { fileName } from "./links"
import type { RunMemory, Session } from "./session"

/* Turns the agent's final report into the task's saved output. */

const PLATFORMS = ["instagram", "tiktok", "youtube", "linkedin", "facebook", "pinterest", "reddit", "threads", "x"] as const

function guessPlatform(text: string) {
  const lower = text.toLowerCase()
  if (/\b(twitter|tweet)/.test(lower)) return "x"
  return PLATFORMS.find((p) => (p === "x" ? /\bx\s*(post|thread)|\bon x\b/.test(lower) : lower.includes(p))) ?? null
}

function guessFormat(text: string): DraftFormat {
  const lower = text.toLowerCase()
  if (/hashtag/.test(lower) && !/caption|post/.test(lower)) return "hashtags"
  if (/carousel/.test(lower)) return "carousel"
  if (/thread/.test(lower)) return "thread"
  if (/script|reel|video|short/.test(lower)) return "video_script"
  if (/stor(y|ies)/.test(lower)) return "story"
  if (/idea/.test(lower)) return "content_idea"
  if (/caption/.test(lower)) return "caption"
  return "post"
}

// First sentence of the summary as a short headline
function headline(summary: string, fallback: string) {
  const first = summary.trim().split(/(?<=[.!?])\s/)[0]?.trim() || fallback
  return first.length > 140 ? `${first.slice(0, 137)}...` : first
}

/**
 * Small models often finish without calling the save tools. The work is still saved: research
 * without findings gets one finding from its report, creator work without drafts gets one draft
 * with every image made this attempt.
 */
async function ensureSaved(session: Session, memory: RunMemory, report: { summary: string; details: string; sources: SourceLink[] }) {
  const { task } = session
  const taskText = `${task.title}\n${task.instructions}`
  try {
    if (session.agentKey === "research" && !memory.findings?.length && report.summary.trim()) {
      const finding = await session.outputs.addFinding({
        requestId: task.requestId,
        taskId: task.id,
        kind: "insight",
        platform: guessPlatform(taskText),
        title: headline(report.summary, task.title),
        summary: report.summary,
        details: report.details || null,
        sources: report.sources,
        tags: [],
        basis: memory.browsed && report.sources.length > 0 ? "web" : "knowledge",
      })
      memory.findings = [finding.id]
    }
    const images = [...new Set(memory.images ?? [])]
    // A post has images or one video: the newest video wins
    const video = memory.videos?.at(-1)
    if (session.agentKey === "creator" && !memory.drafts?.length && (report.details.trim() || images.length > 0 || video)) {
      const body = report.details.trim() || report.summary.trim()
      const draft = await session.outputs.addDraft({
        requestId: task.requestId,
        taskId: task.id,
        platform: guessPlatform(taskText) ?? "instagram",
        format: guessFormat(taskText),
        title: task.title,
        body,
        hashtags: body.match(/#[\p{L}\p{N}_]+/gu) ?? [],
        imageUrls: video ? [video] : images.slice(0, 20),
        notes: "Saved automatically from the agent's final report.",
      })
      memory.drafts = [draft.id]
    }
  } catch (error) {
    console.error("Could not save the agent's work as a finding or draft", error)
  }
}

/** The task's final output: the report plus its files and sources, after making sure the work is in the database. */
export async function finalOutput(
  session: Session,
  memory: RunMemory,
  report: { summary: string; details: string; fileLines: string[]; sources: SourceLink[] }
) {
  await ensureSaved(session, memory, report)
  // Images the agent made but didn't list still belong in the result, so they show with it
  const listed = report.fileLines.join("\n")
  const unlisted = [...new Set(memory.images ?? [])].filter((url) => !listed.includes(url))
  const fileLines = [...report.fileLines, ...unlisted.map((url) => `- ${fileName(new URL(url).pathname)}: ${url}`)]
  const saved = [
    memory.findings?.length ? `${memory.findings.length} research finding${memory.findings.length === 1 ? "" : "s"}` : "",
    memory.drafts?.length ? `${memory.drafts.length} content draft${memory.drafts.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean)
  return [
    report.summary.trim(),
    report.details.trim(),
    fileLines.length ? `Files:\n${fileLines.join("\n")}` : "",
    report.sources.length ? `Sources:\n${report.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n")}` : "",
    saved.length ? `Saved to the database: ${saved.join(" and ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}
