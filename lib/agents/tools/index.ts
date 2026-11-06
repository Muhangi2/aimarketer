import "server-only"
import { askUserTool, computerTool, readPageTool, webSearchTool } from "./browser"
import { saveDraftTool, writeCopyTool } from "./creator"
import { imageTools } from "./images"
import { saveFindingTool } from "./research"
import { quickSearchTool } from "./search"
import { makeVideoTool } from "./video"
import type { Session } from "./session"
import { askMasterTool, finishTaskTool } from "./task"
import { computersConfigured } from "@/lib/computers/desktop"
import { textSearchAvailable } from "@/lib/search/web"

/*
 * The OpenAI Agents SDK tools each agent gets. Small models choose better from a short list, so
 * each agent only sees its own tools, and the browser tools only when the task needs the web
 * (session.browse, see toolPlan).
 *
 *   Research Agent: quick_search, web_search, computer, ask_user_for_help, read_page, save_research_finding
 *   Creator Agent:  write_copy, generate_image, edit_image, make_video, save_content_draft (+ browser tools)
 *   Both:           ask_master, finish_task
 *
 * quick_search (text results from a search API) is only offered when a search key is set.
 */

// Text search before the screenshot browser: small models pick the first fitting tool
const textSearch = (session: Session) => (textSearchAvailable() ? [quickSearchTool(session)] : [])

function researchTools(session: Session) {
  const browser = session.browse
    ? [...textSearch(session), webSearchTool(session), computerTool(session), askUserTool(session), readPageTool(session)]
    : []
  return [...browser, saveFindingTool(session)]
}

function creatorTools(session: Session) {
  const { generateImage, editImage } = imageTools(session)
  const browser = session.browse ? [...textSearch(session), webSearchTool(session), computerTool(session), askUserTool(session)] : []
  // make_video renders on the agent's desktop
  const video = computersConfigured() ? [makeVideoTool(session)] : []
  return [writeCopyTool(session), generateImage, editImage, ...video, saveDraftTool(session), ...browser]
}

export function buildTools(session: Session) {
  const own = session.agentKey === "research" ? researchTools(session) : creatorTools(session)
  return [...own, askMasterTool(), finishTaskTool(session)]
}

export { STOP_TOOLS } from "./task"
export { parseSources, URL_IN_TEXT } from "./links"
export { finalOutput } from "./report"
export * from "./session"
