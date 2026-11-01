import { z } from "zod"
import { AGENT_KEYS } from "@/lib/agent-roles"
import { OutputStore } from "@/lib/agents/outputs"
import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"
import { createInsForgeServerClient } from "@/lib/insforge/server"

/*
 * Saved agent outputs for a campaign:
 *   GET   ?campaignId=…&kind=results|findings|drafts&q=…&agent=…&taskId=…&limit=…
 *         kind "results" is every finished task's output; q is a full-text search.
 *   PATCH { campaignId, draftId, status } changes a content draft's status.
 */

const querySchema = z.object({
  campaignId: z.string().uuid(),
  kind: z.enum(["results", "findings", "drafts"]).default("results"),
  q: z.string().trim().max(200).optional(),
  agent: z.enum(AGENT_KEYS).optional(),
  taskId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

async function ownerStore(campaignId: string): Promise<{ error: Response } | { outputs: OutputStore }> {
  const auth = await authorizeCampaign(campaignId)
  if (auth.error) return { error: auth.error }
  // RLS limits every read to the signed-in owner's rows
  return { outputs: new OutputStore(await createInsForgeServerClient(), campaignId, auth.store.userId) }
}

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return jsonError(400, "Invalid request")
  const { campaignId, kind, q, agent, taskId, limit } = parsed.data

  const auth = await ownerStore(campaignId)
  if ("error" in auth) return auth.error

  try {
    const items = await auth.outputs.search(kind, { q, agentKey: agent, taskId, limit })
    return Response.json({ kind, items }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Could not search agent outputs", error)
    return jsonError(500, "Couldn't load the saved results.")
  }
}

const patchSchema = z.object({
  campaignId: z.string().uuid(),
  draftId: z.string().uuid(),
  status: z.enum(["draft", "approved", "scheduled", "published", "archived"]),
})

export async function PATCH(request: Request) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError(400, "Invalid request")

  const auth = await ownerStore(parsed.data.campaignId)
  if ("error" in auth) return auth.error

  try {
    const draft = await auth.outputs.setDraftStatus(parsed.data.draftId, parsed.data.status)
    if (!draft) return jsonError(404, "Draft not found")
    return Response.json({ draft })
  } catch (error) {
    console.error("Could not update the draft", error)
    return jsonError(500, "Couldn't update the draft.")
  }
}
