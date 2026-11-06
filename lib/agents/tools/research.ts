import "server-only"
import { z } from "zod"
import { lenientTool } from "@/lib/ai/lenient-tool"
import { FINDING_KINDS } from "@/lib/agents/types"
import { parseSources } from "./links"
import { memoryOf, pauseGate, setActivity, toolError, type Session } from "./session"

/* Research Agent tools: save_research_finding (to the research_finding table). */

export function saveFindingTool(session: Session) {
  return lenientTool({
    errorFunction: toolError,
    name: "save_research_finding",
    needsApproval: pauseGate(session),
    description:
      "Save one research finding to the database so the team can find it later: a trend, hashtag, competitor insight, audience insight, content idea, news item, platform update or general insight, with its sources.",
    parameters: z.object({
      kind: z.enum(FINDING_KINDS).catch("insight"),
      title: z.string().min(1).describe("Short headline, e.g. 'Faceless POV reels are growing in fitness'"),
      summary: z.string().min(1).describe("1-3 sentences: what it is and why it matters for the campaign"),
      details: z.string().nullable().default(null).describe("Supporting detail: examples, numbers you saw, how to use it"),
      platform: z.string().nullable().default(null).describe("instagram, tiktok, youtube, x, linkedin, facebook, reddit, pinterest, google or web"),
      sources: z.array(z.string()).default([]).describe('URLs of pages this came from, e.g. "https://..." or "Title | https://..."'),
      tags: z.array(z.string()).default([]).describe("A few keywords to find it later"),
      basis: z.enum(["knowledge", "web"]).catch("knowledge").describe('"web" if you checked it on the web this task (quick_search or the browser), otherwise "knowledge"'),
    }),
    execute: async (input, ctx) => {
      const memory = memoryOf(ctx)
      const sources = parseSources(input.sources)
      const finding = await session.outputs.addFinding({
        requestId: session.task.requestId,
        taskId: session.task.id,
        kind: input.kind,
        platform: input.platform,
        title: input.title,
        summary: input.summary,
        details: input.details,
        sources,
        tags: input.tags,
        // Only work checked on the web counts as live
        basis: input.basis === "web" && memory.browsed ? "web" : "knowledge",
      })
      memory.findings = [...(memory.findings ?? []), finding.id]
      await setActivity(session, `Saved a finding: ${finding.title.slice(0, 60)}`)
      return `Saved finding ${memory.findings.length} (${finding.kind}, ${finding.basis}).`
    },
  })
}
