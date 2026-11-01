"use client"

import { useEffect, useState } from "react"
import { Database, Globe, Link2, Loader2 } from "lucide-react"
import { cn } from "cn"
import { ImageStrip } from "@/components/agents/task-artifacts"
import type { ContentDraftRecord, ResearchFindingRecord } from "@/lib/agents/types"

type Loaded = { findings: ResearchFindingRecord[]; drafts: ContentDraftRecord[] }

// Refreshes the session once if the access token expired
async function getJson(url: string, signal: AbortSignal) {
  let res = await fetch(url, { signal, cache: "no-store" })
  if (res.status === 401 && (await fetch("/api/auth/refresh", { method: "POST", signal })).ok) res = await fetch(url, { signal, cache: "no-store" })
  if (!res.ok) throw new Error("Couldn't load the saved work.")
  return res.json() as Promise<{ items: unknown[] }>
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

const label = (value: string) => value.replace(/_/g, " ")

/**
 * The research findings or content drafts an agent saved for one task, loaded when the task is
 * opened. `version` changes when the task does, so a finished task shows its newest saves.
 */
export function TaskOutputs({
  campaignId,
  taskId,
  agentKey,
  version,
}: {
  campaignId: string
  taskId: string
  agentKey: "research" | "creator"
  version: number
}) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const kind = agentKey === "research" ? "findings" : "drafts"
    const params = new URLSearchParams({ campaignId, kind, taskId, limit: "50" })
    getJson(`/api/agents/outputs?${params}`, controller.signal)
      .then(({ items }) => {
        setError(null)
        setData(kind === "findings" ? { findings: items as ResearchFindingRecord[], drafts: [] } : { findings: [], drafts: items as ContentDraftRecord[] })
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Couldn't load the saved work.")
      })
    return () => controller.abort()
  }, [campaignId, taskId, agentKey, version])

  if (error) return <p className="text-destructive">{error}</p>
  if (!data) {
    return (
      <p className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Loading saved work…
      </p>
    )
  }
  if (data.findings.length === 0 && data.drafts.length === 0) return null

  return (
    <div>
      <p className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground">
        <Database className="size-3" />
        Saved to the database ·{" "}
        {agentKey === "research"
          ? `${data.findings.length} finding${data.findings.length === 1 ? "" : "s"}`
          : `${data.drafts.length} draft${data.drafts.length === 1 ? "" : "s"}`}
      </p>

      {data.findings.length > 0 && (
        <ul className="mt-1.5 space-y-2">
          {data.findings.map((f) => (
            <li key={f.id} className="rounded-lg border bg-muted/30 p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary capitalize">{label(f.kind)}</span>
                {f.platform && <span className="rounded-full bg-muted px-1.5 py-px text-[10px] capitalize">{f.platform}</span>}
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px]",
                    f.basis === "web" ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                  )}
                >
                  {f.basis === "web" && <Globe className="size-2.5" />}
                  {f.basis === "web" ? "Checked live" : "From knowledge"}
                </span>
              </div>
              <p className="mt-1 font-medium">{f.title}</p>
              <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{f.summary}</p>
              {f.sources.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {f.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-primary hover:underline">
                        <Link2 className="size-3 shrink-0" />
                        <span className="truncate">{s.title}</span>
                        <span className="shrink-0 text-muted-foreground">· {host(s.url)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {data.drafts.length > 0 && (
        <ul className="mt-1.5 space-y-2">
          {data.drafts.map((d) => (
            <li key={d.id} className="rounded-lg border bg-muted/30 p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-medium text-primary capitalize">{d.platform}</span>
                <span className="rounded-full bg-muted px-1.5 py-px text-[10px] capitalize">{label(d.format)}</span>
                <span className="rounded-full bg-muted px-1.5 py-px text-[10px] capitalize text-muted-foreground">{d.status}</span>
              </div>
              <p className="mt-1 font-medium">{d.title}</p>
              <p className="mt-0.5 whitespace-pre-line">{d.body}</p>
              {d.hashtags.length > 0 && <p className="mt-1 text-primary">{d.hashtags.join(" ")}</p>}
              {d.callToAction && <p className="mt-1 text-muted-foreground">Call to action: {d.callToAction}</p>}
              <ImageStrip urls={d.imageUrls} className="mt-2" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
