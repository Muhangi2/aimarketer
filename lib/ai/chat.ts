import "server-only"
import { assistant, run, system, user } from "@openai/agents"
import { z } from "zod"
import { getChatAgent, roleReminder, ROLES, type ChatToolset } from "@/lib/ai/agents"
import { completeJSON } from "@/lib/ai/llm"
import { analyticsTools, performanceSummary } from "@/lib/agents/tools/analytics"
import { connectBlotatoMcp } from "@/lib/blotato/mcp"
import { connectPostizMcp } from "@/lib/postiz/mcp"
import { connectZernioMcp } from "@/lib/zernio/mcp"
import type { AgentKey } from "@/lib/agent-roles"
import type { AgentStore } from "@/lib/agents/store"
import type { AgentMessage } from "@/lib/agents/types"

// Context window sent to the model: enough for a conversation, bounded for a small local model
const MAX_HISTORY = 20
// With MCP tools the agent may look a few things up before answering
const MAX_TOOL_TURNS = 5

export const chatRequestSchema = z.object({
  campaignId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
})

export const masterChatRequestSchema = chatRequestSchema.extend({
  // The user's IANA time zone, so the Master Agent schedules in local time
  timeZone: z.string().max(64).optional(),
})

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
  // The user's own Zernio, Blotato and Postiz accounts, read-only, for whichever they connected
  const isAnalytics = agentKey === "analytics"
  const scope = { userId: store.userId, campaignId: store.campaignId, campaignName }
  const [zernio, blotato, postiz, brief, dataBrief] = await Promise.all([
    connectZernioMcp(store.userId),
    connectBlotatoMcp(store.userId),
    connectPostizMcp(store.userId),
    taskBrief(store, agentKey),
    // The Analytics Agent starts from the campaign's real numbers, even if the model skips its tools
    isAnalytics
      ? performanceSummary(scope).catch((error) => {
          console.error("Could not load the analytics summary for chat", error)
          return undefined
        })
      : undefined,
  ])
  const connected = { zernio, blotato, postiz }
  const toolsets = (Object.keys(connected) as ChatToolset[]).filter((k) => connected[k])
  const servers = toolsets.map((k) => connected[k]!)
  let closed = false
  const closeServers = async () => {
    if (servers.length === 0 || closed) return
    closed = true
    await Promise.all(servers.map((s) => s.close().catch((error) => console.error(`Could not close the ${s.name} MCP connection`, error))))
  }
  // The browser went away mid-reply: flush won't run
  signal?.addEventListener("abort", () => void closeServers(), { once: true })

  const ownTools = isAnalytics ? analyticsTools(scope) : []
  let result
  try {
    const base = getChatAgent(agentKey, toolsets)
    const agent = servers.length || ownTools.length ? base.clone({ mcpServers: servers, tools: ownTools }) : base
    result = await run(agent, input, {
      stream: true,
      context: { campaignName, taskBrief: brief, dataBrief },
      signal,
      maxTurns: servers.length || ownTools.length ? MAX_TOOL_TURNS : 1,
    })
  } catch (error) {
    await closeServers()
    throw error
  }

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
          await closeServers()
          if (reply.trim()) await save(reply)
        },
      })
    )
    .pipeThrough(new TextEncoderStream())
}
