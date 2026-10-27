import { z } from "zod"
import { authorizeCampaign, jsonError } from "@/lib/agents/route-auth"

const querySchema = z.object({ campaignId: z.string().uuid() })

// Latest chats, requests, tasks, runs and statuses; the workspace polls this while tasks run in the background
export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return jsonError(400, "Invalid request")

  const auth = await authorizeCampaign(parsed.data.campaignId)
  if ("error" in auth) return auth.error

  try {
    return Response.json(await auth.store.snapshot(), { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Could not load the agent workspace", error)
    return jsonError(500, "Couldn't load the latest agent activity.")
  }
}
