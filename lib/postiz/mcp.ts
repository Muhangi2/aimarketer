import "server-only"
import { MCPServerStreamableHttp } from "@openai/agents"
import { getPostizApiKey } from "@/lib/postiz/store"

/*
 * Postiz's hosted MCP server (https://docs.postiz.com/mcp/setup), authenticated with the user's own
 * key as a Bearer token. Chat agents only get read-only tools: posts are created and scheduled on
 * the Posts page.
 */

const POSTIZ_MCP_URL = "https://mcp.postiz.com/mcp"

const READ_ONLY_TOOLS = ["integrationList", "groupList", "integrationSchema", "postsListTool", "mediaListTool"]

/**
 * A connected Postiz MCP server for the user, or null if they haven't connected Postiz or it can't
 * be reached (the chat then works without it). Close it when the run is done.
 */
export async function connectPostizMcp(userId: string) {
  const apiKey = await getPostizApiKey(userId).catch((error) => {
    console.error("Could not load the Postiz key for chat", error)
    return null
  })
  if (!apiKey) return null

  const server = new MCPServerStreamableHttp({
    url: POSTIZ_MCP_URL,
    name: "postiz",
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    toolFilter: { allowedToolNames: READ_ONLY_TOOLS },
    cacheToolsList: true,
    timeout: 20_000,
  })
  try {
    await server.connect()
    return server
  } catch (error) {
    console.error("Could not connect to Postiz's MCP server", error)
    await server.close().catch(() => {})
    return null
  }
}
