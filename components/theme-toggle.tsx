"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { motion } from "motion/react"
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import { cn } from "cn"

const OPTIONS: { value: "light" | "dark" | "system"; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
]

// The theme is only known in the browser, so render a neutral placeholder until then
function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

/** Segmented Light / Dark / System control. `showLabels` adds text next to the icons. */
export function ThemeToggle({ className, showLabels = false }: { className?: string; showLabels?: boolean }) {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const current = mounted ? theme ?? "system" : null

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/60 p-0.5", className)}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = current === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "relative inline-flex h-7 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              showLabels ? "px-2.5" : "w-7",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {active && (
              <motion.span
                layoutId={`theme-pill-${showLabels ? "labels" : "icons"}`}
                className="absolute inset-0 rounded-full bg-card shadow-sm ring-1 ring-border"
                transition={{ type: "spring", stiffness: 500, damping: 36 }}
              />
            )}
            <Icon className="relative size-3.5" />
            {showLabels && <span className="relative">{label}</span>}
          </button>
        )
      })}
    </div>
  )
}
