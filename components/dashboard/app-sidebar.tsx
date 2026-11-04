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
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
            <Sparkles className="size-4" />
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight transition-opacity duration-200 group-data-[collapsible=icon]:opacity-0">
            Hively
          </span>
        </Link>
        <CampaignSwitcher campaigns={campaigns} activeId={activeCampaignId} />
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">Menu</SidebarGroupLabel>
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
                      // One style for every item: grey icons, the current page on a white pill with a brand icon
                      className="group/nav h-11 gap-3 rounded-full px-1.5 text-sidebar-foreground/70 transition-all duration-200 hover:bg-white/60 hover:text-sidebar-foreground data-active:bg-white data-active:font-medium data-active:text-sidebar-foreground data-active:shadow-[0_1px_2px_rgba(0,0,0,0.05),0_6px_16px_-8px_rgba(0,0,0,0.12)] group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:p-1.5!"
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
                          active ? "bg-brand text-white" : "text-muted-foreground group-hover/nav:text-sidebar-foreground"
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
