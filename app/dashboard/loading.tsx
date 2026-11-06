import { Skeleton } from "@/components/ui/skeleton"

// Shown inside the dashboard shell (sidebar and header stay put) while a page loads
export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-8" aria-busy="true" aria-label="Loading">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
