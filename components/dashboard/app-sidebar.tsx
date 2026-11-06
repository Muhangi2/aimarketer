"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus, Sparkles } from "lucide-react"
import type { Campaign } from "@/lib/campaign"
import type { DashboardUser } from "@/lib/dashboard"
import { DASHBOARD_NAV, NAV_GROUPS, findNavItem } from "@/lib/dashboard-nav"
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
  const closeOnMobile = () => isMobile && setOpenMobile(false)

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="gap-3 px-3 pt-4">
        <Link
          href="/dashboard"
          className="flex h-9 items-center gap-2.5 rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
            <Sparkles className="size-3.5" />
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight group-data-[collapsible=icon]:hidden">Hively</span>
        </Link>
        <CampaignSwitcher campaigns={campaigns} activeId={activeCampaignId} />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="New post"
              onClick={closeOnMobile}
              render={<Link href="/dashboard/posts/new" />}
              className="h-9 justify-center gap-2 rounded-lg bg-primary font-medium text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-primary/90 hover:text-primary-foreground active:bg-primary active:text-primary-foreground"
            >
              <Plus />
              <span className="group-data-[collapsible=icon]:hidden">New post</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0 px-1 pt-1">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group} className="py-1.5">
            <SidebarGroupLabel className="h-7 px-2 text-[11px] font-medium text-muted-foreground/80">{group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {DASHBOARD_NAV.filter((item) => item.group === group).map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={item === current}
                      tooltip={item.label}
                      onClick={closeOnMobile}
                      render={<Link href={item.href} />}
                      // Current page: raised surface, brand icon and a short accent bar on the left
                      className="relative h-9 gap-3 rounded-lg px-2.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-foreground data-active:bg-sidebar-accent data-active:font-medium data-active:text-sidebar-foreground data-active:shadow-[0_1px_2px_rgba(0,0,0,0.06)] data-active:before:absolute data-active:before:top-2 data-active:before:bottom-2 data-active:before:-left-1 data-active:before:w-[3px] data-active:before:rounded-full data-active:before:bg-brand dark:data-active:shadow-none data-active:[&_svg]:text-brand"
                    >
                      <item.Icon className="size-[18px]" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
