"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { AlertTriangle, CheckCircle2, ExternalLink, KeyRound, Link2, Unplug } from "lucide-react"
import { cn } from "cn"
import { connectIntegration, disconnectIntegration } from "@/app/actions/integrations"
import { AccountList } from "@/components/accounts/account-list"
import { RefreshAccountsButton } from "@/components/accounts/refresh-accounts-button"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { PROVIDERS } from "@/lib/integrations/providers"
import type { IntegrationConnection, IntegrationProvider } from "@/lib/integrations/types"

function KeyForm({ provider, submitLabel, onDone, onCancel }: { provider: IntegrationProvider; submitLabel: string; onDone: () => void; onCancel?: () => void }) {
  const info = PROVIDERS[provider]
  const [apiKey, setApiKey] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          setError(null)
          const result = await connectIntegration(provider, apiKey)
          if (!result.ok) {
            setError(result.error)
            return
          }
          setApiKey("")
          onDone()
        })
      }}
    >
      <Label htmlFor={`${provider}-key`}>{info.name} API key</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={`${provider}-key`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={info.keyPlaceholder}
            className="h-9 pl-8 font-mono"
            aria-invalid={Boolean(error)}
          />
        </div>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={pending || apiKey.trim().length < 10}>
            {pending ? <Spinner data-icon="inline-start" /> : <Link2 data-icon="inline-start" />}
            {pending ? "Checking key…" : submitLabel}
          </Button>
        </div>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Stored encrypted on our server and only ever sent to {info.name}. It never reaches your browser again.</p>
      )}
    </form>
  )
}

/** One posting service on the Integrations page: connect with an API key, see accounts, replace or disconnect. */
export function IntegrationCard({ provider, connection }: { provider: IntegrationProvider; connection: IntegrationConnection | null }) {
  const info = PROVIDERS[provider]
  const router = useRouter()
  const [replacing, setReplacing] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)
  const [disconnecting, startDisconnect] = useTransition()
  const [disconnectError, setDisconnectError] = useState<string | null>(null)

  const done = () => {
    setReplacing(false)
    router.refresh()
  }

  return (
    <section className="rounded-2xl border bg-card shadow-sm animate-in fade-in slide-in-from-bottom-1 duration-500">
      <header className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
        <span className={cn("flex size-10 items-center justify-center rounded-xl bg-linear-to-br text-sm font-bold text-white shadow-sm", info.tone)}>{info.initial}</span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            {info.name}
            {connection?.status === "active" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" /> Connected
              </span>
            )}
            {connection?.status === "invalid" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                <AlertTriangle className="size-3" /> Key not working
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground">{info.tagline}</p>
        </div>
        <a href={info.dashboardUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          Open {info.name} <ExternalLink className="size-3" />
        </a>
      </header>

      <div className="flex flex-col gap-5 p-5">
        {!connection ? (
          <>
            <ol className="grid gap-3 sm:grid-cols-3">
              {info.steps.map((step, i) => (
                <li key={step.title} className="flex gap-3 rounded-xl border bg-muted/30 p-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{i + 1}</span>
                  <span className="min-w-0 text-xs">
                    {step.href ? (
                      <a href={step.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-foreground hover:underline">
                        {step.title} <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="font-semibold text-foreground">{step.title}</span>
                    )}
                    <span className="mt-0.5 block text-muted-foreground">{step.body}</span>
                  </span>
                </li>
              ))}
            </ol>
            <KeyForm provider={provider} submitLabel="Connect" onDone={done} />
          </>
        ) : (
          <>
            {connection.status === "invalid" && (
              <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="mt-px size-3.5 shrink-0" />
                {connection.lastError ?? `${info.name} rejected the saved key.`} Paste a new key to keep {info.publishes ? "publishing" : "using it"}.
              </p>
            )}

            <dl className="grid gap-3 text-xs sm:grid-cols-3">
              <div className="rounded-xl border p-3">
                <dt className="text-muted-foreground">API key</dt>
                <dd className="mt-1 font-mono text-sm">••••••••{connection.keyHint}</dd>
              </div>
              <div className="rounded-xl border p-3">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="mt-1 text-sm font-medium capitalize">{connection.plan ?? "Unknown"}</dd>
              </div>
              <div className="rounded-xl border p-3">
                <dt className="text-muted-foreground">Accounts last refreshed</dt>
                <dd className="mt-1 text-sm font-medium">
                  {connection.accountsRefreshedAt ? formatDistanceToNow(new Date(connection.accountsRefreshedAt), { addSuffix: true }) : "Never"}
                </dd>
              </div>
            </dl>

            {replacing || connection.status === "invalid" ? (
              <KeyForm provider={provider} submitLabel="Save new key" onDone={done} onCancel={connection.status === "active" ? () => setReplacing(false) : undefined} />
            ) : null}

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-semibold">Connected accounts ({connection.accounts.length})</h4>
                  <p className="text-xs text-muted-foreground">
                    Connected something new on {info.name}? Refresh to see it here{info.publishes ? " and in the post composer" : ""}.
                  </p>
                </div>
                <RefreshAccountsButton provider={provider} size="sm" />
              </div>
              {connection.accounts.length > 0 ? (
                <AccountList accounts={connection.accounts} publishes={info.publishes} providerName={info.name} />
              ) : (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No accounts on {info.name} yet.{" "}
                  <a href={info.dashboardUrl} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">
                    Connect them on {info.name}
                  </a>
                  , then refresh.
                </p>
              )}
            </div>

            <div className={cn("flex flex-wrap items-center justify-end gap-2 border-t pt-4")}>
              {disconnectError && <p className="mr-auto text-xs text-destructive">{disconnectError}</p>}
              {!replacing && connection.status === "active" && (
                <Button variant="outline" size="sm" onClick={() => setReplacing(true)}>
                  <KeyRound data-icon="inline-start" /> Replace key
                </Button>
              )}
              <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDisconnect(true)}>
                <Unplug data-icon="inline-start" /> Disconnect
              </Button>
            </div>
          </>
        )}
      </div>

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {info.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your API key is deleted from our server. {info.disconnectNote} Your accounts on {info.name} aren&apos;t affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={disconnecting}
              onClick={() =>
                startDisconnect(async () => {
                  setDisconnectError(null)
                  const result = await disconnectIntegration(provider)
                  setConfirmDisconnect(false)
                  if (!result.ok) setDisconnectError(result.error)
                  router.refresh()
                })
              }
            >
              {disconnecting && <Spinner data-icon="inline-start" />} Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
