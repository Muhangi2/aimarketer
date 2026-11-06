"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUpRight, Menu, X } from "lucide-react"
import { cn } from "cn"
import { Brand } from "@/components/brand"
import { ThemeToggle } from "@/components/theme-toggle"

export const NAV_ITEMS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
]

const SECTION_IDS = NAV_ITEMS.map((item) => item.href.slice(1))

function useActiveSection() {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id)
      },
      // A section counts as active while it crosses the middle of the screen
      { rootMargin: "-50% 0px -50% 0px" }
    )
    SECTION_IDS.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return active
}

// Transparent header with a frosted pill around the links; colours come from the active theme
export function SiteHeader() {
  const [hovered, setHovered] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const active = useActiveSection()

  const highlighted = hovered ?? active

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-0 z-[1000] text-foreground"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Hively home">
          <Brand />
        </Link>

        {/* Frosted pill around the links only */}
        <nav
          className="hidden items-center rounded-full border border-foreground/10 bg-card/75 px-2 py-1 shadow-sm backdrop-blur-xl md:flex"
          onMouseLeave={() => setHovered(null)}
        >
          {NAV_ITEMS.map((item) => {
            const id = item.href.slice(1)
            return (
              <a
                key={item.href}
                href={item.href}
                onMouseEnter={() => setHovered(id)}
                className={cn(
                  "relative px-3.5 py-2 text-[15px] transition-colors duration-200",
                  highlighted === id ? "opacity-100" : "opacity-65"
                )}
              >
                <span className="relative">{item.label}</span>
                {/* Thin underline that slides to the hovered or current link */}
                {highlighted === id && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-3.5 bottom-1 h-[1.5px] rounded-full bg-current"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
              </a>
            )
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden bg-card/75 backdrop-blur-xl lg:inline-flex" />
          <Link
            href="/sign-in"
            className="hidden h-10 items-center rounded-lg border border-foreground/15 bg-card/60 px-4 text-[15px] backdrop-blur-xl transition-colors hover:bg-card sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="group inline-flex h-10 items-center gap-1.5 rounded-lg bg-foreground pr-3.5 pl-4 text-[15px] font-medium text-background transition-colors hover:bg-foreground/90 active:scale-[0.97]"
          >
            Get started
            <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex size-10 items-center justify-center rounded-lg md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col border-t border-border bg-card p-3 shadow-lg md:hidden"
          >
            {[...NAV_ITEMS, { label: "Sign in", href: "/sign-in" }].map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-4 py-3 text-foreground/85 hover:bg-foreground/[0.05]"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-border px-4 pt-3">
              <span className="text-sm text-muted-foreground">Theme</span>
              <ThemeToggle showLabels />
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
