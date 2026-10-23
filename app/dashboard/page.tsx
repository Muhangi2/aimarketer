import { redirect } from "next/navigation"
import { signOut } from "@/app/actions/auth"
import { createInsForgeServerClient } from "@/lib/insforge/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default async function DashboardPage() {
  const insforge = await createInsForgeServerClient()
  const { data } = await insforge.auth.getCurrentUser()
  const user = data?.user
  if (!user) redirect("/sign-in")

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("name, email, avatar_url, created_at")
    .eq("user_id", user.id)
    .maybeSingle()

  const name = profile?.name ?? user.profile?.name ?? user.email

  return (
    <main className="min-h-svh bg-muted/40 p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <form action={signOut}>
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            {profile?.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="size-12 rounded-full" />
            )}
            <div>
              <CardTitle>Welcome, {name}</CardTitle>
              <CardDescription>{profile?.email ?? user.email}</CardDescription>
            </div>
          </CardHeader>
          {profile?.created_at && (
            <CardContent className="text-sm text-muted-foreground">
              Member since {new Date(profile.created_at).toLocaleDateString()}
            </CardContent>
          )}
        </Card>
      </div>
    </main>
  )
}
