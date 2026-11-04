"use client"

import { useActionState, useState, useTransition } from "react"
import Link from "next/link"
import { MailCheck } from "lucide-react"
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[2rem] leading-tight font-medium tracking-[-0.035em]">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-[15px] text-slate-500">
          {isSignUp
            ? "Hire your AI marketing team in about ten minutes."
            : "Sign in to continue to your campaigns."}
        </p>
      </div>

      <form action={signInWithGoogle}>
        <GoogleButton />
      </form>

      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-black/10" />
        or continue with email
        <span className="h-px flex-1 bg-black/10" />
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        {isSignUp && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" autoComplete="name" placeholder="Jane Doe" className="h-11 rounded-xl border-black/12 bg-white px-3.5 text-[15px] focus-visible:border-brand focus-visible:ring-brand/20" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            className="h-11 rounded-xl border-black/12 bg-white px-3.5 text-[15px] focus-visible:border-brand focus-visible:ring-brand/20"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            placeholder={isSignUp ? "At least 6 characters" : "••••••••"}
            className="h-11 rounded-xl border-black/12 bg-white px-3.5 text-[15px] focus-visible:border-brand focus-visible:ring-brand/20"
            minLength={6}
            required
          />
        </div>

        {state.error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
        )}

        <Button type="submit" className="h-11 rounded-full bg-brand text-[15px] text-white hover:bg-brand/90" disabled={pending}>
          {pending && <Spinner />}
          {isSignUp ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500">
        {isSignUp ? "Already have an account? " : "New to Hively? "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
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
    <div className="flex flex-col gap-6">
      <span className="flex size-12 items-center justify-center rounded-xl bg-brand-wash text-brand">
        <MailCheck className="size-6" />
      </span>
      <div>
        <h1 className="text-[2rem] leading-tight font-medium tracking-[-0.035em]">Check your email</h1>
        <p className="mt-2 text-[15px] text-slate-500">
          {info ?? `Enter the 6-digit code sent to ${email}.`}
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="otp" value={otp} />
        <InputOTP maxLength={6} value={otp} onChange={setOtp} autoFocus containerClassName="justify-center">
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, i) => (
              <InputOTPSlot key={i} index={i} className="size-11 text-base" />
            ))}
          </InputOTPGroup>
        </InputOTP>

        {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        <Button type="submit" className="h-11 rounded-full bg-brand text-[15px] text-white hover:bg-brand/90" disabled={pending || otp.length !== 6}>
          {pending && <Spinner />}
          Verify and continue
        </Button>
      </form>

      <p className="text-center text-sm text-slate-500">
        Didn&apos;t get it?{" "}
        <button
          type="button"
          disabled={resending}
          className="font-medium text-brand underline-offset-4 hover:underline disabled:opacity-50"
          onClick={() => startResend(async () => setResendState(await resendVerification(email)))}
        >
          Resend code
        </button>
      </p>
    </div>
  )
}

function GoogleButton() {
  return (
    <Button type="submit" variant="outline" className="h-11 w-full rounded-full border-black/15 bg-white text-[15px] hover:bg-black/[0.03]">
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
