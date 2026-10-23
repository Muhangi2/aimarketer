"use client"

import { useActionState, useState, useTransition } from "react"
import Link from "next/link"
import {
  signIn,
  signUp,
  verifyEmail,
  resendVerification,
  signInWithGoogle,
  type AuthState,
} from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"

type Mode = "sign-in" | "sign-up"

export function AuthForm({ mode, initialError }: { mode: Mode; initialError?: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    mode === "sign-in" ? signIn : signUp,
    { error: initialError }
  )

  if (state.verifyEmail) {
    return <VerifyEmailForm email={state.verifyEmail} message={state.message} />
  }

  const isSignUp = mode === "sign-up"

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{isSignUp ? "Create your account" : "Welcome back"}</CardTitle>
        <CardDescription>
          {isSignUp ? "Sign up with Google or your email." : "Sign in with Google or your email."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form action={signInWithGoogle}>
          <GoogleButton />
        </form>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <form action={formAction} className="flex flex-col gap-3">
          {isSignUp && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" placeholder="Jane Doe" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={6}
              required
            />
          </div>

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <Button type="submit" size="lg" disabled={pending}>
            {pending && <Spinner />}
            {isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        {isSignUp ? (
          <span>
            Already have an account?{" "}
            <Link href="/sign-in" className="text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </span>
        ) : (
          <span>
            New here?{" "}
            <Link href="/sign-up" className="text-primary underline-offset-4 hover:underline">
              Create an account
            </Link>
          </span>
        )}
      </CardFooter>
    </Card>
  )
}

function VerifyEmailForm({ email, message }: { email: string; message?: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(verifyEmail, {
    verifyEmail: email,
    message,
  })
  const [otp, setOtp] = useState("")
  const [resendState, setResendState] = useState<AuthState | null>(null)
  const [resending, startResend] = useTransition()

  const info = resendState?.message ?? state.message
  const error = resendState?.error ?? state.error

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Check your email</CardTitle>
        <CardDescription>{info ?? `Enter the 6-digit code sent to ${email}.`}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col items-center gap-4">
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="otp" value={otp} />
          <InputOTP maxLength={6} value={otp} onChange={setOtp} autoFocus>
            <InputOTPGroup>
              {Array.from({ length: 6 }, (_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" size="lg" className="w-full" disabled={pending || otp.length !== 6}>
            {pending && <Spinner />}
            Verify and continue
          </Button>
          <Button
            type="button"
            variant="link"
            disabled={resending}
            onClick={() => startResend(async () => setResendState(await resendVerification(email)))}
          >
            Resend code
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function GoogleButton() {
  return (
    <Button type="submit" variant="outline" size="lg" className="w-full">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
      </svg>
      Continue with Google
    </Button>
  )
}
