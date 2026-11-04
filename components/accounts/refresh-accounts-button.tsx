"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { cn } from "cn"
import { refreshIntegrationAccounts } from "@/app/actions/integrations"
import type { IntegrationProvider } from "@/lib/integrations/types"
import { Button } from "@/components/ui/button"

/** Fetches the user's connected accounts from the service again. */
export function RefreshAccountsButton({ provider, className, size = "default" }: { provider: IntegrationProvider; className?: string; size?: "default" | "sm" | "lg" }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <Button
        variant="outline"
        size={size}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const result = await refreshIntegrationAccounts(provider)
            if (!result.ok) setError(result.error)
            router.refresh()
          })
        }
      >
        <RefreshCw data-icon="inline-start" className={cn(pending && "animate-spin")} />
        {pending ? "Refreshing…" : "Refresh accounts"}
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
    </div>
  )
}
