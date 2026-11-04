"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Unplug } from "lucide-react"
import { cn } from "cn"
import { disconnectZernioAccount, refreshZernioAccounts } from "@/app/actions/zernio"
import { PlatformIcon } from "@/components/posts/platform-icon"
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
import type { SocialAccount } from "@/lib/integrations/types"
import { PLATFORMS, POST_PLATFORMS, type PostPlatform } from "@/lib/posts/platforms"

// Why a connection didn't go through, from the codes Zernio sends back
const CONNECT_ERRORS: Record<string, string> = {
  oauth_denied: "You cancelled the connection on the platform's screen.",
  not_configured: "Connecting accounts isn't set up on this server yet (ZERNIO_API_KEY is missing).",
  payment_required: "The app's account limit was reached. Ask the admin to add a payment method on Zernio.",
  account_mismatch: "You signed in with a different account than the one being reconnected.",
  missing_tiktok_permissions: "TikTok didn't grant every permission. Try again and allow all of them.",
  unsupported_platform: "That platform isn't supported.",
}

export function ZernioAccounts({
  accounts,
  configured,
  notice,
}: {
  accounts: SocialAccount[]
  configured: boolean
  notice: { connected?: string; error?: string; message?: string; platform?: string }
}) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const [removing, startRemove] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [toRemove, setToRemove] = useState<SocialAccount | null>(null)

  const noticePlatform = notice.platform ?? notice.connected ?? ""
  const platformName = PLATFORMS[noticePlatform as PostPlatform]?.label ?? noticePlatform

  return (
    <section className="flex flex-col gap-4 animate-in fade-in duration-300">
      {notice.connected && (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0" /> {platformName} connected. You can now schedule posts and answer comments and messages from it.
        </p>
      )}
      {notice.error && (
        <p className="flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {platformName ? `${platformName} wasn't connected. ` : ""}
          {CONNECT_ERRORS[notice.error] ?? notice.message ?? "Something went wrong. Please try again."}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {POST_PLATFORMS.map((p) => {
          const info = PLATFORMS[p]
          const count = accounts.filter((a) => a.platform === p).length
          return (
            <a
              key={p}
              href={configured ? `/api/integrations/zernio/connect?platform=${p}` : undefined}
              aria-disabled={!configured}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs transition-all",
                configured ? "hover:-translate-y-0.5 hover:shadow-md" : "pointer-events-none opacity-50"
              )}
            >
              <span className={cn("flex size-10 items-center justify-center rounded-lg", info.tone)}>
                <PlatformIcon platform={p} className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{count ? `Add another ${info.label}` : `Connect ${info.label}`}</span>
                <span className="block text-xs text-muted-foreground">{info.videoOnly ? "Videos and Shorts" : count ? `${count} connected` : "Posts, comments and DMs"}</span>
              </span>
              <Plus className="size-4 text-muted-foreground" />
            </a>
          )
        })}
      </div>
      {!configured && <p className="text-xs text-muted-foreground">Connecting accounts needs ZERNIO_API_KEY on the server.</p>}

      {accounts.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex-1 text-sm font-semibold">
              Your accounts <span className="font-normal text-muted-foreground">· {accounts.length}</span>
            </h3>
            <Button
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() =>
                startRefresh(async () => {
                  setError(null)
                  const result = await refreshZernioAccounts()
                  if (!result.ok) setError(result.error)
                  router.refresh()
                })
              }
            >
              <RefreshCw data-icon="inline-start" className={cn(refreshing && "animate-spin")} /> Refresh
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => {
              const info = PLATFORMS[account.platform as PostPlatform]
              return (
                <li key={account.id} className="group flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs">
                  {account.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={account.picture} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", info?.tone ?? "bg-muted")}>
                      <PlatformIcon platform={account.platform} className="size-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{account.fullname || account.username}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <PlatformIcon platform={account.platform} className="size-3" />
                      {info?.label ?? account.platform}
                      {account.username && ` · @${account.username}`}
                    </span>
                  </span>
                  {account.needsReconnection ? (
                    <a
                      href={`/api/integrations/zernio/connect?platform=${account.platform}`}
                      className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/20"
                    >
                      Reconnect
                    </a>
                  ) : (
                    <span className="shrink-0 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Connected</span>
                  )}
                  <Button size="icon-xs" variant="ghost" aria-label={`Disconnect ${account.username || account.fullname}`} onClick={() => setToRemove(account)}>
                    <Unplug />
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <AlertDialog open={toRemove != null} onOpenChange={(open) => !open && !removing && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {toRemove?.username ? `@${toRemove.username}` : "this account"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Scheduled posts to it won&apos;t go out, and its comments and messages leave your inbox. You can connect it again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removing}
              onClick={() =>
                startRemove(async () => {
                  if (!toRemove) return
                  setError(null)
                  const result = await disconnectZernioAccount(toRemove.id)
                  if (!result.ok) setError(result.error)
                  setToRemove(null)
                  router.refresh()
                })
              }
            >
              {removing && <Spinner data-icon="inline-start" />} Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
