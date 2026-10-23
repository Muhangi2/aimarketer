import { notFound } from "next/navigation"
import { cn } from "cn"
import { DASHBOARD_NAV } from "@/lib/dashboard-nav"

// Placeholder for sections whose pages are not built yet
export default async function DashboardSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  const item = DASHBOARD_NAV.find((n) => n.slug && n.slug === section)
  if (!item) notFound()

  return (
    <div key={item.slug} className="flex h-full items-center justify-center p-6 animate-in fade-in zoom-in-[0.98] duration-500">
      <div className="flex max-w-sm flex-col items-center text-center">
        <span className={cn("flex size-16 items-center justify-center rounded-2xl shadow-lg", item.activeTone)}>
          <item.Icon className="size-7" />
        </span>
        <h2 className="mt-6 text-xl font-semibold tracking-tight">{item.label}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{item.description}.</p>
        <span className="mt-5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          Coming soon
        </span>
      </div>
    </div>
  )
}
