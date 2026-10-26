import "server-only"
import { assistant, run, system, user } from "@openai/agents"
import { z } from "zod"
import { getChatAgent, roleReminder, ROLES } from "@/lib/ai/agents"
import { completeJSON } from "@/lib/ai/llm"
import type { AgentKey } from "@/lib/agent-roles"
import type { AgentStore } from "@/lib/agents/store"
import type { AgentMessage } from "@/lib/agents/types"

// Context window sent to the model: enough for a conversation, bounded for a small local model
const MAX_HISTORY = 20

export const chatRequestSchema = z.object({
  campaignId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
})

export const masterChatRequestSchema = z.union([
  chatRequestSchema,
  // Sent after the user resumes a paused agent, to continue work that was on hold
  z.object({ campaignId: z.string().uuid(), resume: z.literal(true) }),
])

const intentSchema = z.object({ intent: z.enum(["question", "task"]) })

/**
 * Regular agents only take work from the Master Agent. Classifies the user's message so a
 * work request gets redirected instead of done. Falls back to "question" if the check fails;
 * the agent's own rules still apply.
 */
async function isTaskRequest(agentKey: AgentKey, message: string) {
  try {
    const { intent } = await completeJSON(intentSchema, [
      {
        role: "system",
        content: `Classify a message a user sent to the ${ROLES[agentKey].name} of a social media marketing team.
"task": the user asks the agent to produce new work, for example write, draft, create, research, find, plan, schedule, build a calendar or analyze something.
"question": anything else, such as asking what the agent does, asking for an explanation or quick advice, or asking about the status or results of its tasks.
Reply with only a JSON object: {"intent": "question"} or {"intent": "task"}`,
      },
      { role: "user", content: message },
    ], { attempts: 1 })
    return intent === "task"
  } catch {
    return false
  }
}

function redirectReply(agentKey: AgentKey) {
  return `I only take on new work through the Master Agent, who plans it with the whole team and assigns my part. Send this request to the Master Agent and it will assign the ${ROLES[agentKey].name} part to me.\n\nIn the meantime, I'm happy to answer questions about my work or my current tasks.`
}

// Chat history as the model sees it: the agent's own messages are its turns, everything else is input
function toModelInput(agentKey: AgentKey, messages: AgentMessage[]) {
  return messages
    .filter((m) => m.kind !== "error")
    .slice(-MAX_HISTORY)
    .map((m) => {
      if (m.sender === agentKey) return assistant(m.content)
      if (m.sender === "user") return user(m.content)
      return user(`(Message from the Master Agent) ${m.content}`)
    })
}

async function taskBrief(store: AgentStore, agentKey: AgentKey) {
  const tasks = await store.listAgentTasks(agentKey, 6)
  return tasks
    .map((t) => `- "${t.title}" (${t.status.replace("_", " ")})${t.output ? `: ${t.output.slice(0, 200)}` : ""}`)
    .join("\n")
}

/**
 * Saves the user's question, then streams the agent's answer as UTF-8 text and saves it
 * once complete.
 */
export async function streamAgentReply({
  agentKey,
  message,
  store,
  campaignName,
  signal,
}: {
  agentKey: AgentKey
  message: string
  store: AgentStore
  campaignName: string
  signal?: AbortSignal
}) {
  // History first, so it doesn't include the message being saved
  const history = await store.listMessages(agentKey, MAX_HISTORY)
  await store.addMessage({ thread: agentKey, sender: "user", recipient: agentKey, kind: "chat", content: message })

  const save = (content: string) =>
    store
      .addMessage({ thread: agentKey, sender: agentKey, recipient: "user", kind: "chat", content })
      .catch((error) => console.error(`Could not save the ${agentKey} reply`, error))

  if (await isTaskRequest(agentKey, message)) {
    const reply = redirectReply(agentKey)
    await save(reply)
    return new Response(reply).body!
  }

  const input = [...toModelInput(agentKey, history), user(message), system(roleReminder(agentKey))]
  const result = await run(getChatAgent(agentKey), input, {
    stream: true,
    context: { campaignName, taskBrief: await taskBrief(store, agentKey) },
    signal,
    maxTurns: 1,
  })

  // The SDK types this with its own stream shim; at runtime it is the platform's web ReadableStream
  const text = result.toTextStream() as unknown as ReadableStream<string>
  let reply = ""
  return text
    .pipeThrough(
      new TransformStream<string, string>({
        transform(chunk, controller) {
          reply += chunk
          controller.enqueue(chunk)
        },
        async flush() {
          if (reply.trim()) await save(reply)
        },
      })
    )
    .pipeThrough(new TextEncoderStream())
}
