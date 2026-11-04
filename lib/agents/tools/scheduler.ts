import "server-only"
import { z } from "zod"
import { lenientTool } from "@/lib/ai/lenient-tool"
import { getInsForgeAdmin } from "@/lib/insforge/admin"
import { getPublishingSetupFor } from "@/lib/posts/accounts"
import { listSchedulableDrafts, scheduleDraft } from "@/lib/posts/schedule-draft"
import { formatInZone } from "@/lib/posts/time"
import type { PostRecord } from "@/lib/posts/types"
import { platformLabel } from "@/lib/integrations/types"

/*
 * Scheduler Agent tools for tasks the Master Agent assigns: list_drafts, list_accounts and
 * schedule_post, which schedules a saved draft to publish through the user's connected accounts
 * (the same path as the Posts page). Plain-text results for small models.
 */

export type SchedulerScope = {
  userId: string
  campaignId: string
  requestId: string | null
  // Every schedule_post result, so the caller can tell what really happened
  log?: string[]
}

const describe = (p: PostRecord) =>
  `- id ${p.id}: "${p.title}" for ${p.platforms.map(platformLabel).join(", ")}, ${p.media.length ? `${p.media.length} ${p.media.some((m) => m.kind === "video") ? "video" : "image"}${p.media.length === 1 ? "" : "s"}` : "no media"}, saved ${p.createdAt.slice(0, 16).replace("T", " ")} UTC\n  Caption: ${p.body.slice(0, 120).replace(/\s+/g, " ")}`

export function schedulerTools(scope: SchedulerScope) {
  const drafts = lenientTool({
    name: "list_drafts",
    description: "The saved drafts that can be scheduled, with their ids: the ones the team made for this request first.",
    parameters: z.object({}),
    execute: async () => {
      const { forRequest, others } = await listSchedulableDrafts(scope.userId, scope.campaignId, scope.requestId)
      if (forRequest.length === 0 && others.length === 0) return "There are no drafts to schedule. The Creator Agent has to save one first."
      const parts: string[] = []
      if (forRequest.length) parts.push(`Drafts made for this request (newest first; use the newest unless told otherwise):\n${forRequest.map(describe).join("\n")}`)
      if (others.length) parts.push(`Other drafts in the campaign:\n${others.slice(0, 8).map(describe).join("\n")}`)
      return parts.join("\n\n")
    },
  })

  const accounts = lenientTool({
    name: "list_accounts",
    description: "The user's connected Instagram, TikTok and YouTube accounts that posts can publish to.",
    parameters: z.object({}),
    execute: async () => {
      const setup = await getPublishingSetupFor(scope.userId)
      if (setup.accounts.length === 0) return "No accounts are connected. The user can connect Instagram, TikTok or YouTube on the Accounts page."
      return setup.accounts.map((a) => `- ${platformLabel(a.platform)}: ${a.username ? `@${a.username.replace(/^@/, "")}` : a.fullname}`).join("\n")
    },
  })

  const schedule = lenientTool({
    name: "schedule_post",
    description:
      "Schedule a saved draft to publish on the user's connected accounts at a date and time in the user's time zone. It then publishes automatically. Only use it when the task asks to post or schedule.",
    parameters: z.object({
      draft_id: z.string().min(1).describe("The id from list_drafts"),
      platforms: z.array(z.string()).default([]).describe('e.g. ["instagram"]; empty keeps the draft\'s platform'),
      date: z.string().describe("YYYY-MM-DD in the user's time zone"),
      time: z.string().describe("HH:MM, 24-hour, in the user's time zone, e.g. 18:00 for 6 PM"),
      time_zone: z.string().describe("The user's IANA time zone from the task, e.g. Africa/Kampala"),
    }),
    execute: async (input) => {
      const time = /^\d{1,2}:\d{2}$/.test(input.time.trim()) ? input.time.trim().padStart(5, "0") : input.time.trim()
      const result = await scheduleDraft(scope.userId, scope.campaignId, { postId: input.draft_id.trim(), platforms: input.platforms, date: input.date.trim(), time, timeZone: input.time_zone.trim() })
      if (!result.ok) {
        scope.log?.push(`Not scheduled: ${result.error}`)
        return `Not scheduled: ${result.error}`
      }
      const p = result.post
      scope.log?.push(`Scheduled "${p.title}" (${p.id})`)
      return `Scheduled "${p.title}" for ${p.platforms.map(platformLabel).join(", ")} on ${formatInZone(p.scheduledAt!, p.timezone, { dateStyle: "medium", timeStyle: "short" })} (${p.timezone}). It will publish automatically and shows on the Posts page and Calendar.${result.warning ? ` Note: ${result.warning}` : ""}`
    },
  })

  return [drafts, accounts, schedule]
}

/** What the request really has scheduled, for the Master Agent's review. */
export async function scheduledForRequest(scope: SchedulerScope) {
  const { data } = await getInsForgeAdmin()
    .database.from("content_draft")
    .select("id, title, platforms, status, scheduled_at, timezone")
    .eq("user_id", scope.userId)
    .eq("campaign_id", scope.campaignId)
    .eq("request_id", scope.requestId ?? "")
    .in("status", ["scheduled", "publishing", "published"])
  const rows = (data ?? []) as Record<string, unknown>[]
  if (rows.length === 0) return "No post from this request is scheduled or published."
  return `Posts from this request that are really scheduled or published:\n${rows
    .map((r) => `- "${r.title}" (${r.status}) for ${(r.platforms as string[]).join(", ")} at ${formatInZone(String(r.scheduled_at), r.timezone ? String(r.timezone) : null, { dateStyle: "medium", timeStyle: "short" })}`)
    .join("\n")}`
}
