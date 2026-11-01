"use client"

import { useState } from "react"
import { Power } from "lucide-react"
import { cn } from "cn"
import type { AgentWorkspaceState } from "@/hooks/use-agent-workspace"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/** Ends the campaign after a confirmation: plans stop, files are saved, computers shut down. */
export function EndCampaignButton({ workspace, className }: { workspace: AgentWorkspaceState; className?: string }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (workspace.campaignStatus !== "active") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground", className)}>
        {workspace.campaignStatus === "ending" ? <Spinner className="size-3" /> : <Power className="size-3" />}
        {workspace.campaignStatus === "ending" ? "Ending campaign…" : "Campaign ended"}
      </span>
    )
  }

  async function confirm() {
    setPending(true)
    setError(null)
    try {
      await workspace.endCampaign()
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't end the campaign.")
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button variant="outline" className={cn("h-9 rounded-xl text-destructive hover:text-destructive", className)} onClick={() => setOpen(true)}>
        <Power /> End campaign
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              All plans and scheduled tasks stop now. Files left on the agents&apos; computers are uploaded and kept, then the computers are shut
              down for good. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep running</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={confirm}>
              {pending && <Spinner />} End campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
