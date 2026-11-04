import "server-only"
import { z } from "zod"
import { lenientTool } from "@/lib/ai/lenient-tool"
import { mimeFor } from "@/lib/computers/desktop"
import { uploadFromDesktop } from "./files"
import { fileName, httpUrl, isImage, parseSources } from "./links"
import { finalOutput } from "./report"
import { errorText, memoryOf, setActivity, toolError, type Session } from "./session"

/*
 * Tools every agent has for talking to the Master Agent: ask_master (a question; ends the attempt)
 * and finish_task (the final report, saved as the task's output). Both stop the run.
 */

export const STOP_TOOLS = ["finish_task", "ask_master"]

export function askMasterTool() {
  return lenientTool({
    errorFunction: toolError,
    name: "ask_master",
    description: "Ask the Master Agent one short question when the task is impossible without a fact only the user knows. Ends this attempt.",
    parameters: z.object({ question: z.string() }),
    execute: async ({ question }) => JSON.stringify({ kind: "question", question }),
  })
}

export function finishTaskTool(session: Session) {
  return lenientTool({
    errorFunction: toolError,
    name: "finish_task",
    description: "Report your finished work. Ends the task.",
    parameters: z.object({
      summary: z.string().min(1).describe("1-3 sentences"),
      details: z.string().default("").describe("The finished work itself, plain text"),
      files: z.array(z.string()).default([]).describe("URLs of images or files you made"),
      sources: z.array(z.string()).default([]).describe('URLs of pages you used, e.g. "https://example.com/post" or "Title | https://example.com/post"'),
    }),
    execute: async (input, ctx) => {
      const memory = memoryOf(ctx)
      await setActivity(session, "Reporting results")
      const fileLines: string[] = []
      for (const ref of input.files.slice(0, 20)) {
        try {
          const url = httpUrl(ref)
          if (url) {
            if (!Object.values(memory.uploads).includes(url)) {
              await session.computers.addArtifact({
                taskId: session.task.id,
                agentKey: session.agentKey,
                kind: isImage(url) ? "image" : "file",
                name: fileName(new URL(url).pathname),
                url,
                mimeType: mimeFor(url),
                source: "reported",
              })
            }
            fileLines.push(`- ${fileName(new URL(url).pathname)}: ${url}`)
          } else {
            fileLines.push(`- ${fileName(ref)}: ${await uploadFromDesktop(session, memory, ref, "uploaded")}`)
          }
        } catch (error) {
          fileLines.push(`- ${ref}: could not be uploaded (${errorText(error)})`)
        }
      }
      const sources = parseSources(input.sources)
      for (const link of sources) {
        await session.computers
          .addArtifact({ taskId: session.task.id, agentKey: session.agentKey, kind: "link", name: link.title, url: link.url, source: "reported" })
          .catch(() => undefined)
      }
      const output = await finalOutput(session, memory, { summary: input.summary, details: input.details, fileLines, sources })
      return JSON.stringify({ kind: "output", output })
    },
  })
}
