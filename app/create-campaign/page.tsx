import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft, LogOut } from "lucide-react"
import { signOut } from "@/app/actions/auth"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { getUserCampaign } from "@/lib/campaign"
import { listOffices } from "@/lib/offices"
import { CreateCampaignWizard } from "@/components/campaign/create-campaign-wizard"
import { Brand } from "@/components/brand"
import { Button } from "@/components/ui/button"

export default async function CreateCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>
}) {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  const user = data?.user
  if (!user) redirect("/sign-in")

  // Onboarding runs once; later campaigns come from the dashboard switcher (?new=1)
  const hasCampaign = Boolean(await getUserCampaign(insforge, user.id))
  if (hasCampaign && (await searchParams).new !== "1") redirect("/dashboard")

  const offices = await listOffices()

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-muted/50">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-card px-4 sm:px-6">
        <Brand />
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
          {hasCampaign ? (
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
              <ArrowLeft /> Back to dashboard
            </Button>
          ) : (
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut /> Sign out
              </Button>
            </form>
          )}
        </div>
      </header>
      <main className="min-h-0 flex-1 p-3 sm:p-4 lg:p-6">
        <CreateCampaignWizard userId={user.id} offices={offices} isFirst={!hasCampaign} />
      </main>
    </div>
  )
}
