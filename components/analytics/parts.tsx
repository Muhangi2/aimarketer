import { cn } from "cn"
import type { LucideIcon } from "lucide-react"

/* Small pieces shared by the Analytics page's cards and charts. */

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })
const full = new Intl.NumberFormat("en-US")

/** 12.4K. A missing value is an em dash, never 0. */
export const formatCompact = (n: number | null) => (n === null ? "—" : n < 10_000 ? full.format(Math.round(n)) : compact.format(n))
export const formatFull = (n: number | null) => (n === null ? "—" : full.format(Math.round(n)))

export function formatHours(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, "") : Math.round(hours)} h`
}

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
/** "Oct 6" for a "YYYY-MM-DD" day. */
export const formatDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`))
export const formatSpan = (start: string, end: string) => (start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`)

/** A dashboard card: icon chip, title, optional controls on the right. */
export function ChartCard({
  title,
  description,
  Icon,
  tone,
  action,
  className,
  children,
}: {
  title: string
  description: string
  Icon: LucideIcon
  tone: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-2xl border bg-card shadow-sm", className)}>
      <header className="flex flex-wrap items-center gap-3 px-5 pt-5">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tone)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        </div>
        {action}
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pt-4 pb-5">{children}</div>
    </section>
  )
}

/** A compact segmented control (one choice). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={o.key === value}
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            o.key === value ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** In-chart empty state: says why there's nothing, instead of drawing zeros. */
export function ChartEmpty({ Icon, title, description, className }: { Icon: LucideIcon; title: string; description: string; className?: string }) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center", className)}>
      <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{description}</p>
    </div>
  )
}

/** A tooltip shell for charts: the value leads, the label follows. */
export function TooltipCard({ title, rows }: { title: string; rows: { color: string; label: string; value: string }[] }) {
  return (
    <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1.5 text-muted-foreground">{title}</p>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="font-semibold tabular-nums">{r.value}</span>
            <span className="text-muted-foreground">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
