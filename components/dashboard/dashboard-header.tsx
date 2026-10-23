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
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <SidebarTrigger className="-ml-1 size-9 rounded-lg text-muted-foreground hover:text-foreground" />
      <span aria-hidden className="h-5 w-px bg-border" />

      <div className="min-w-0 flex-1">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="truncate">{campaignName}</span>
          <ChevronRight className="size-3 shrink-0" />
          <span className="truncate">{item.label}</span>
        </nav>
        <h1 key={item.href} className="truncate text-base font-semibold tracking-tight animate-in fade-in slide-in-from-left-1 duration-300">
          {item.label}
        </h1>
      </div>

      <label className="relative hidden items-center lg:flex">
        <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search…"
          className="h-9 w-64 rounded-xl border bg-muted/50 pr-12 pl-9 text-sm transition-all outline-none placeholder:text-muted-foreground focus:w-72 focus:border-primary/40 focus:bg-background focus:ring-3 focus:ring-primary/10"
        />
        <kbd className="pointer-events-none absolute right-2.5 rounded-md border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </label>

      <Button variant="ghost" size="icon" className="relative size-9 rounded-xl text-muted-foreground hover:text-foreground" aria-label="Notifications">
        <Bell className="size-[18px]" />
        <span className="absolute top-2 right-2 size-2 rounded-full bg-primary ring-2 ring-background" />
      </Button>
      <UserAvatar user={user} className="size-9" />
    </header>
  )
}
