"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

// Light, dark or system theme for the whole app, saved in localStorage ("theme")
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}
