"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sparkles } from "lucide-react"
import { cn } from "cn"
import type { Campaign } from "@/lib/campaign"
import type { DashboardUser } from "@/lib/dashboard"
import { DASHBOARD_NAV, findNavItem } from "@/lib/dashboard-nav"
import { CampaignSwitcher } from "@/components/dashboard/campaign-switcher"
import { UserMenu } from "@/components/dashboard/user-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

export function AppSidebar({
  user,
  campaigns,
  activeCampaignId,
}: {
  user: DashboardUser
  campaigns: Campaign[]
  activeCampaignId: string
}) {
  const pathname = usePathname()
  const current = findNavItem(pathname)
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="gap-4 px-3 pt-4">
        <Link
          href="/dashboard"
          className="flex h-10 items-center gap-2.5 rounded-xl px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-600/30">
            <Sparkles className="size-4" />
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight transition-opacity duration-200 group-data-[collapsible=icon]:opacity-0">
            AI Marketer
          </span>
        </Link>
        <CampaignSwitcher campaigns={campaigns} activeId={activeCampaignId} />
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] tracking-wider uppercase">Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {DASHBOARD_NAV.map((item) => {
                const active = item === current
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      onClick={() => isMobile && setOpenMobile(false)}
                      render={<Link href={item.href} />}
                      className="group/nav h-11 gap-3 rounded-xl px-1.5 text-sidebar-foreground/80 transition-all duration-200 hover:bg-sidebar-accent/70 data-active:bg-sidebar-accent data-active:font-semibold data-active:text-sidebar-foreground group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:p-1.5!"
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 group-hover/nav:scale-105",
                          active ? `${item.activeTone} shadow-md` : item.tone
                        )}
                      >
                        <item.Icon />
                      </span>
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4">
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
