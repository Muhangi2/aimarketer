"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUpRight, Menu, X } from "lucide-react"
import { cn } from "cn"
import { Brand } from "@/components/brand"

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

// One dark glass style reads well over both the dark and the light sections
export function SiteHeader() {
  // True while a light section sits behind the header
  const [onLight, setOnLight] = useState(true)
  const [hovered, setHovered] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const active = useActiveSection()

  useEffect(() => {
    const onScroll = () => {
      const under = document.elementsFromPoint(window.innerWidth / 2, 32)
      setOnLight(!under.some((el) => el.closest('[data-nav-theme="dark"]')))
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const highlighted = hovered ?? active

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      // No background: the text flips between white and dark to suit the section behind it
      className={cn(
        "fixed inset-x-0 top-0 z-[1000] transition-colors duration-300",
        onLight ? "text-charcoal" : "text-white"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="Hively home">
          <Brand />
        </Link>

        {/* Frosted pill around the links only; tint follows the section behind it */}
        <nav
          className={cn(
            "hidden items-center rounded-full border px-2 py-1 backdrop-blur-xl transition-colors duration-300 md:flex",
            onLight ? "border-black/10 bg-white/70 shadow-sm" : "border-white/15 bg-white/10"
          )}
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
          <Link
            href="/sign-in"
            className="hidden h-10 items-center rounded-lg border border-current/25 px-4 text-[15px] transition-colors hover:bg-current/10 sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className={cn(
              "group inline-flex h-10 items-center gap-1.5 rounded-lg pr-3.5 pl-4 text-[15px] font-medium transition-colors duration-300 active:scale-[0.97]",
              onLight ? "bg-charcoal text-white" : "bg-white text-charcoal"
            )}
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
            className="flex flex-col border-t border-white/10 bg-night p-3 md:hidden"
          >
            {[...NAV_ITEMS, { label: "Sign in", href: "/sign-in" }].map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-4 py-3 text-white/85 hover:bg-white/[0.08]"
              >
                {item.label}
              </a>
            ))}
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  )
}
