import "server-only"
import { MCPServerStreamableHttp } from "@openai/agents"
import { getZernioReadKey } from "@/lib/zernio/store"

/*
 * Zernio's hosted MCP server (https://docs.zernio.com/mcp), authenticated with the user's own
 * read-only key: it only reaches their profile and can only make GET requests. The tool list is
 * kept short for small local models.
 */

const ZERNIO_MCP_URL = "https://mcp.zernio.com/mcp"

// The user's key is read-only too, so even a tool that writes would be refused by Zernio
const READ_ONLY_TOOLS = [
  "accounts_list",
  "accounts_get",
  "posts_list",
  "posts_get",
  "posts_list_failed",
  "analytics_get_analytics",
  "analytics_get_daily_metrics",
  "analytics_get_best_time_to_post",
  "analytics_get_post_timeline",
  "comments_list_inbox_comments",
  "comments_get_inbox_post_comments",
]

/** A connected Zernio MCP server for the user, or null (the chat then works without it). Close it when done. */
export async function connectZernioMcp(userId: string) {
  const apiKey = await getZernioReadKey(userId).catch((error) => {
    console.error("Could not load the Zernio key for chat", error)
    return null
  })
  if (!apiKey) return null

  const server = new MCPServerStreamableHttp({
    url: ZERNIO_MCP_URL,
    name: "zernio",
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    toolFilter: { allowedToolNames: READ_ONLY_TOOLS },
    cacheToolsList: true,
    timeout: 20_000,
  })
  try {
    await server.connect()
    return server
  } catch (error) {
    console.error("Could not connect to Zernio's MCP server", error)
    await server.close().catch(() => {})
    return null
  }
}
