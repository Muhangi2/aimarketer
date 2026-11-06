"use client"

import { ChevronsUpDown, LogOut } from "lucide-react"
import { signOut } from "@/app/actions/auth"
import type { DashboardUser } from "@/lib/dashboard"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

export function UserAvatar({ user, className = "size-8" }: { user: DashboardUser; className?: string }) {
  const initials = user.name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return user.avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.avatarUrl} alt="" className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white`}
    >
      {initials}
    </span>
  )
}

export function UserMenu({ user }: { user: DashboardUser }) {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={user.name}
                className="h-12 gap-3 rounded-xl px-2 group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:p-1.5!"
              />
            }
          >
            <UserAvatar user={user} />
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? "top" : "right"}
            align="end"
            sideOffset={10}
            className="w-60 rounded-xl p-1.5"
          >
            {/* Base UI only allows a label inside a group */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex items-center gap-2.5 p-2 font-normal">
                <UserAvatar user={user} />
                <span className="grid min-w-0 leading-tight">
                  <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="my-1.5" />
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="text-sm text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
            <DropdownMenuSeparator className="my-1.5" />
            <DropdownMenuItem variant="destructive" className="rounded-lg p-2" onClick={() => signOut()}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
