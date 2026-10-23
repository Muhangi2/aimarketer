import { cookies } from "next/headers"
import { getDashboardContext } from "@/lib/dashboard"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, campaigns, activeCampaign } = await getDashboardContext()
  // Icons-only until the user expands the sidebar; the choice is remembered
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value === "true"

  return (
    <TooltipProvider delay={150}>
      <SidebarProvider
        defaultOpen={sidebarOpen}
        style={{ "--sidebar-width": "17rem", "--sidebar-width-icon": "4.25rem" } as React.CSSProperties}
        className="h-svh overflow-hidden"
      >
        <AppSidebar user={user} campaigns={campaigns} activeCampaignId={activeCampaign.id} />
        <SidebarInset className="min-w-0 overflow-hidden bg-muted/40">
          <DashboardHeader user={user} campaignName={activeCampaign.name} />
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
