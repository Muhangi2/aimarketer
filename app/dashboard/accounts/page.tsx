import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { getDashboardContext } from "@/lib/dashboard"
import { getConnection } from "@/lib/integrations/store"
import { PROVIDERS } from "@/lib/integrations/providers"
import type { IntegrationConnection, IntegrationProvider } from "@/lib/integrations/types"
import { AccountList } from "@/components/accounts/account-list"
import { RefreshAccountsButton } from "@/components/accounts/refresh-accounts-button"
import { ZernioAccounts } from "@/components/accounts/zernio-accounts"
import { zernioConfigured } from "@/lib/zernio/client"
import { getZernioProfile } from "@/lib/zernio/store"

function ProviderAccounts({ provider, connection }: { provider: IntegrationProvider; connection: IntegrationConnection }) {
  const info = PROVIDERS[provider]
  return (
    <section className="flex flex-col gap-3 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            {info.name} <span className="font-normal text-muted-foreground">· {connection.accounts.length} account{connection.accounts.length === 1 ? "" : "s"}</span>
          </h3>
          <p className="text-xs text-muted-foreground">{info.publishes ? "Scheduled posts publish through these accounts." : "Your agents can read these channels in chat."}</p>
        </div>
        <RefreshAccountsButton provider={provider} size="sm" />
      </div>
      {connection.status === "invalid" && (
        <p className="flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {info.name} stopped accepting your API key{info.publishes ? ", so posts can't go out" : ""}.{" "}
            <Link href="/dashboard/settings/integrations" className="font-medium underline underline-offset-2">
              Add a new key
            </Link>
            .
          </span>
        </p>
      )}
      {connection.accounts.length > 0 ? (
        <AccountList accounts={connection.accounts} publishes={info.publishes} providerName={info.name} />
      ) : (
        <p className="rounded-2xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Your {info.name} account has no social accounts yet.{" "}
          <a href={info.dashboardUrl} target="_blank" rel="noreferrer" className="font-medium text-foreground underline-offset-2 hover:underline">
            Connect them on {info.name}
          </a>
          , then refresh.
        </p>
      )}
    </section>
  )
}

/* The user's social accounts: connected here through Zernio, plus any Blotato or Postiz accounts. */
export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string; message?: string; platform?: string }> }) {
  await getDashboardContext()
  const insforge = await createInsForgeServerClient()
  const [zernio, blotato, postiz, notice] = await Promise.all([
    getZernioProfile(insforge),
    getConnection(insforge, "blotato"),
    getConnection(insforge, "postiz"),
    searchParams,
  ])

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-6 lg:p-8">
      <div className="animate-in fade-in duration-300">
        <h2 className="text-2xl font-semibold tracking-tight">Accounts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Instagram, TikTok and YouTube to schedule posts and answer comments and messages from your inbox.
        </p>
      </div>

      <ZernioAccounts accounts={zernio?.accounts ?? []} configured={zernioConfigured()} notice={notice} />

      {(blotato || postiz) && (
        <div className="flex flex-col gap-8 border-t pt-8">
          <p className="-mb-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">Other connections</p>
          {blotato && <ProviderAccounts provider="blotato" connection={blotato} />}
          {postiz && <ProviderAccounts provider="postiz" connection={postiz} />}
        </div>
      )}
      {!blotato && !postiz && (
        <p className="text-xs text-muted-foreground">
          Already use Blotato or Postiz?{" "}
          <Link href="/dashboard/settings/integrations" className="font-medium text-foreground underline-offset-2 hover:underline">
            Connect them in Settings → Integrations
          </Link>
          .
        </p>
      )}
    </div>
  )
}
