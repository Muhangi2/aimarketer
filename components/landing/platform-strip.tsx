"use client"

import { motion, useReducedMotion } from "motion/react"
import { PLATFORMS } from "./platforms"

// Every supported network scrolling past, right under the hero
export function PlatformStrip() {
  const reduceMotion = useReducedMotion()
  const items = [...PLATFORMS, ...PLATFORMS]

  return (
    <section className="border-y border-black/12 bg-night py-10 text-ink">
      <p className="text-center font-mono text-[11px] tracking-[0.14em] text-ink/55 uppercase">
        One team. Every platform your audience uses.
      </p>
      <div className="relative mt-7 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <motion.div
          className="flex w-max gap-10 pr-10"
          animate={reduceMotion ? undefined : { x: ["0%", "-50%"] }}
          transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
        >
          {items.map(({ key, name, Icon }, i) => (
            <span key={`${key}-${i}`} className="flex items-center gap-2.5 text-ink/75 transition-colors hover:text-ink">
              <Icon size={22} color="currentColor" />
              <span className="text-lg font-medium tracking-tight whitespace-nowrap">{name}</span>
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
