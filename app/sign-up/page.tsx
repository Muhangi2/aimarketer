import { AuthForm } from "@/components/auth/auth-form"

export default function SignUpPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <AuthForm mode="sign-up" />
    </main>
  )
}
