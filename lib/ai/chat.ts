import "server-only"
import { assistant, run, system, user } from "@openai/agents"
import { z } from "zod"
import { getAgent, roleReminder, type AgentContext } from "@/lib/ai/agents"
import type { AgentKey } from "@/lib/agent-roles"

// Context window sent to the model: enough for a conversation, bounded for a 7B local model
const MAX_HISTORY = 20

export const chatRequestSchema = z.object({
  campaignId: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      })
    )
    .min(1)
    .max(100)
    .refine((m) => m[m.length - 1].role === "user", "The last message must be from the user"),
})

export type ChatRequest = z.infer<typeof chatRequestSchema>

/** Runs one agent turn over the conversation and streams the reply as UTF-8 text. */
export async function streamAgentReply({
  agentKey,
  messages,
  context,
  signal,
}: {
  agentKey: AgentKey
  messages: ChatRequest["messages"]
  context: AgentContext
  signal?: AbortSignal
}) {
  const input = [
    ...messages.slice(-MAX_HISTORY).map((m) => (m.role === "user" ? user(m.content) : assistant(m.content))),
    system(roleReminder(agentKey)),
  ]

  const result = await run(getAgent(agentKey), input, { stream: true, context, signal, maxTurns: 1 })
  // The SDK types this with its own stream shim; at runtime it is the platform's web ReadableStream
  const text = result.toTextStream() as unknown as ReadableStream<string>
  return text.pipeThrough(new TextEncoderStream())
}
