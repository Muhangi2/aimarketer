import { AuthForm } from "@/components/auth/auth-form"
import { AuthShell } from "@/components/auth/auth-shell"

const ERRORS: Record<string, string> = {
  oauth_failed: "Google sign-in failed. Please try again.",
  missing_verifier: "Your sign-in session expired. Please try again.",
  exchange_failed: "Could not complete Google sign-in. Please try again.",
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <AuthShell>
      <AuthForm mode="sign-in" initialError={error ? ERRORS[error] ?? "Sign in failed." : undefined} />
    </AuthShell>
  )
}
