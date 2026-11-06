"use client"

import { useEffect } from "react"
import Link from "next/link"
import { RotateCcw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"

// Friendly fallback when a dashboard page fails to load; the sidebar and header stay usable
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <TriangleAlert className="size-5" />
        </span>
        <h2 className="mt-4 text-lg font-medium tracking-tight">This page didn&apos;t load</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Something went wrong on our side. Your campaigns and posts are safe. Try again, or head back to the overview.
        </p>
        {error.digest && <p className="mt-3 font-mono text-[11px] text-muted-foreground/80">Reference: {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/dashboard" />}>
            Go to overview
          </Button>
          <Button onClick={reset}>
            <RotateCcw /> Try again
          </Button>
        </div>
      </div>
    </div>
  )
}
