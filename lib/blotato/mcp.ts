import "server-only"
import { MCPServerStreamableHttp } from "@openai/agents"
import { getBlotatoApiKey } from "@/lib/blotato/store"

/*
 * Blotato's MCP server (https://help.blotato.com/start-with-an-ai-agent/mcp), authenticated with
 * the user's own key. Chat agents only get read-only tools: posts are created and scheduled on the
 * Posts page, so they're saved here and published by the Inngest job.
 */

const BLOTATO_MCP_URL = "https://mcp.blotato.com/mcp"

const READ_ONLY_TOOLS = [
  "blotato_get_user",
  "blotato_list_accounts",
  "blotato_list_posts",
  "blotato_get_post_status",
  "blotato_list_top_posts",
  "blotato_get_post_analytics",
]

/**
 * A connected Blotato MCP server for the user, or null if they haven't connected Blotato or it
 * can't be reached (the chat then works without it). Close it when the run is done.
 */
export async function connectBlotatoMcp(userId: string) {
  const apiKey = await getBlotatoApiKey(userId).catch((error) => {
    console.error("Could not load the Blotato key for chat", error)
    return null
  })
  if (!apiKey) return null

  const server = new MCPServerStreamableHttp({
    url: BLOTATO_MCP_URL,
    name: "blotato",
    requestInit: { headers: { "blotato-api-key": apiKey } },
    toolFilter: { allowedToolNames: READ_ONLY_TOOLS },
    cacheToolsList: true,
    timeout: 20_000,
  })
  try {
    await server.connect()
    return server
  } catch (error) {
    console.error("Could not connect to Blotato's MCP server", error)
    await server.close().catch(() => {})
    return null
  }
}
