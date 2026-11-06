import { cookies } from "next/headers"
import { getDashboardContext } from "@/lib/dashboard"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { DashboardHeader } from "@/components/dashboard/dashboard-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, campaigns, activeCampaign } = await getDashboardContext()
  // Open with labels unless the user collapsed it; the choice is remembered
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false"

  return (
    <TooltipProvider delay={150}>
      <SidebarProvider
        defaultOpen={sidebarOpen}
        style={{ "--sidebar-width": "16rem", "--sidebar-width-icon": "4rem" } as React.CSSProperties}
        className="h-svh overflow-hidden"
      >
        <AppSidebar user={user} campaigns={campaigns} activeCampaignId={activeCampaign.id} />
        <SidebarInset className="min-w-0 overflow-hidden bg-background">
          <DashboardHeader user={user} campaignName={activeCampaign.name} />
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
