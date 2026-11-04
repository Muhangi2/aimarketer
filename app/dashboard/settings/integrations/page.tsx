import { createInsForgeServerClient } from "@/lib/insforge/server"
import { getDashboardContext } from "@/lib/dashboard"
import { getConnection } from "@/lib/integrations/store"
import Link from "next/link"
import { CheckCircle2, Share2 } from "lucide-react"
import { IntegrationCard } from "@/components/integrations/integration-card"
import { Button } from "@/components/ui/button"
import { zernioConfigured } from "@/lib/zernio/client"
import { getZernioProfile } from "@/lib/zernio/store"

export default async function IntegrationsPage() {
  await getDashboardContext()
  const insforge = await createInsForgeServerClient()
  const [blotato, postiz, zernio] = await Promise.all([getConnection(insforge, "blotato"), getConnection(insforge, "postiz"), getZernioProfile(insforge)])
  const zernioAccounts = zernio?.accounts.length ?? 0

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="animate-in fade-in duration-300">
        <p className="text-xs font-medium text-muted-foreground">Settings</p>
        <h2 className="text-2xl font-semibold tracking-tight">Integrations</h2>
        <p className="mt-1 text-sm text-muted-foreground">Connect the services your posts go out through. Keys are stored encrypted and only used on our server.</p>
      </div>
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card px-5 py-4 shadow-sm">
        <span className="flex size-10 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-sky-600 text-sm font-bold text-white shadow-sm">Z</span>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            Zernio
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Built in</span>
            {zernioAccounts > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" /> {zernioAccounts} account{zernioAccounts === 1 ? "" : "s"}
              </span>
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            {zernioConfigured()
              ? "The main way to publish, and to answer comments and DMs. No key or sign-up needed: connect accounts on the Accounts page."
              : "Not set up on this server yet: add ZERNIO_API_KEY to enable connecting accounts."}
          </p>
        </div>
        {zernioConfigured() && (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/dashboard/accounts" />}>
            <Share2 data-icon="inline-start" /> Manage accounts
          </Button>
        )}
      </section>
      <p className="-mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Bring your own account</p>
      <IntegrationCard provider="blotato" connection={blotato} />
      <IntegrationCard provider="postiz" connection={postiz} />
    </div>
  )
}
