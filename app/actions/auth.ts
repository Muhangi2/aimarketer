"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createAuthActions } from "@insforge/sdk/ssr"
import { createInsForgeServerClient } from "@/lib/insforge/server"

export type AuthState = {
  error?: string
  // Set after sign-up when the email still needs its 6-digit code
  verifyEmail?: string
  message?: string
}

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

function field(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim()
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, "email")
  const password = String(formData.get("password") ?? "")
  if (!email || !password) return { error: "Email and password are required." }

  const auth = createAuthActions({ cookies: await cookies() })
  const { data, error } = await auth.signInWithPassword({ email, password })

  if (error || !data?.user) {
    // Unverified accounts must finish the code step before they can sign in
    if (error?.statusCode === 403 || /verif/i.test(error?.message ?? "")) {
      const server = await createInsForgeServerClient()
      await server.auth.resendVerificationEmail({ email })
      return { verifyEmail: email, message: "Verify your email first. We sent you a new code." }
    }
    return { error: error?.message ?? "Sign in failed." }
  }

  redirect("/dashboard")
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = field(formData, "name")
  const email = field(formData, "email")
  const password = String(formData.get("password") ?? "")
  if (!email || !password) return { error: "Email and password are required." }

  const auth = createAuthActions({ cookies: await cookies() })
  const { data, error } = await auth.signUp({
    email,
    password,
    name: name || undefined,
    redirectTo: `${appUrl}/sign-in`,
  })

  if (error) return { error: error.message ?? "Sign up failed." }
  if (data?.requireEmailVerification) {
    return { verifyEmail: email, message: `We sent a 6-digit code to ${email}.` }
  }

  redirect("/dashboard")
}

export async function verifyEmail(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = field(formData, "email")
  const otp = field(formData, "otp")
  if (otp.length !== 6) return { verifyEmail: email, error: "Enter the 6-digit code." }

  const auth = createAuthActions({ cookies: await cookies() })
  const { data, error } = await auth.verifyEmail({ email, otp })

  if (error || !data?.user) {
    return { verifyEmail: email, error: error?.message ?? "Invalid or expired code." }
  }

  redirect("/dashboard")
}

export async function resendVerification(email: string): Promise<AuthState> {
  const server = await createInsForgeServerClient()
  const { error } = await server.auth.resendVerificationEmail({ email })
  if (error) return { verifyEmail: email, error: error.message }
  return { verifyEmail: email, message: `A new code was sent to ${email}.` }
}

export async function signInWithGoogle() {
  const cookieStore = await cookies()
  const auth = createAuthActions({ cookies: cookieStore })
  const { data, error } = await auth.signInWithOAuth("google", {
    redirectTo: `${appUrl}/api/auth/callback`,
    additionalParams: { prompt: "select_account" },
    skipBrowserRedirect: true,
  })

  if (error || !data.url || !data.codeVerifier) {
    redirect("/sign-in?error=oauth_failed")
  }

  cookieStore.set("insforge_code_verifier", data.codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  })

  redirect(data.url)
}

export async function signOut() {
  const auth = createAuthActions({ cookies: await cookies() })
  await auth.signOut()
  redirect("/sign-in")
}
