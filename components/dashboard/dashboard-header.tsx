"use client"

import { usePathname } from "next/navigation"
import { Bell, ChevronRight, Search } from "lucide-react"
import type { DashboardUser } from "@/lib/dashboard"
import { findNavItem } from "@/lib/dashboard-nav"
import { UserAvatar } from "@/components/dashboard/user-menu"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function DashboardHeader({ user, campaignName }: { user: DashboardUser; campaignName: string }) {
  const item = findNavItem(usePathname())

  return (
    <header className="sticky top-0 z-20 flex h-[72px] shrink-0 items-center gap-3 border-b border-black/[0.06] bg-background px-4 sm:px-8">
      <SidebarTrigger className="-ml-1 size-9 rounded-full text-muted-foreground hover:text-foreground" />
      <span aria-hidden className="h-5 w-px bg-border" />

      <div className="min-w-0 flex-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
          <span className="truncate">{campaignName}</span>
          <ChevronRight className="size-3 shrink-0" />
          <span className="truncate text-brand">{item.label}</span>
        </nav>
        <h1
          key={item.href}
          className="truncate text-xl font-medium tracking-[-0.03em] animate-in fade-in slide-in-from-bottom-1 duration-500"
        >
          {item.label}
        </h1>
      </div>

      <label className="relative hidden items-center lg:flex">
        <Search className="pointer-events-none absolute left-3.5 size-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search…"
          className="h-10 w-64 rounded-full border border-black/[0.08] bg-white pr-12 pl-10 text-sm transition-all outline-none placeholder:text-muted-foreground focus:w-72 focus:border-brand/40 focus:ring-3 focus:ring-brand/10"
        />
        <kbd className="pointer-events-none absolute right-3 rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          ⌘K
        </kbd>
      </label>

      <Button variant="outline" size="icon" className="relative size-10 bg-white text-muted-foreground hover:text-foreground" aria-label="Notifications">
        <Bell className="size-[18px]" />
        <span className="absolute top-2 right-2 size-2 rounded-full bg-primary ring-2 ring-background" />
      </Button>
      <UserAvatar user={user} className="size-9" />
    </header>
  )
}
