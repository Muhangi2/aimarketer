"use client"

import { useOptimistic, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { setActiveCampaign } from "@/app/actions/campaign"
import type { Campaign } from "@/lib/campaign"
import { CampaignIcon } from "@/components/campaign/campaign-icon"
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
import { Spinner } from "@/components/ui/spinner"

export function CampaignSwitcher({ campaigns, activeId }: { campaigns: Campaign[]; activeId: string }) {
  const router = useRouter()
  const { isMobile } = useSidebar()
  const [pending, startTransition] = useTransition()
  const [optimisticId, setOptimisticId] = useOptimistic(activeId)
  const active = campaigns.find((c) => c.id === optimisticId) ?? campaigns[0]

  function select(id: string) {
    if (id === optimisticId) return
    startTransition(async () => {
      setOptimisticId(id)
      await setActiveCampaign(id)
    })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={active.name}
                className="h-12 gap-3 rounded-xl border bg-background px-2 shadow-xs transition-all hover:border-primary/30 hover:bg-background data-popup-open:border-primary/40 data-popup-open:ring-3 data-popup-open:ring-primary/10 group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-1.5! group-data-[collapsible=icon]:shadow-none"
              />
            }
          >
            <CampaignIcon type={active.icon_type} icon={active.icon} className="size-8 shrink-0 rounded-lg" />
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-[11px] font-medium text-muted-foreground">Campaign</span>
              <span className="truncate text-sm font-semibold">{active.name}</span>
            </span>
            {pending ? (
              <Spinner className="ml-auto size-4 text-muted-foreground" />
            ) : (
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
            )}
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={10}
            className="w-64 rounded-xl p-1.5"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 text-xs text-muted-foreground">Your campaigns</DropdownMenuLabel>
              {campaigns.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => select(c.id)} className="gap-2.5 rounded-lg p-2">
                  <CampaignIcon type={c.icon_type} icon={c.icon} className="size-7 rounded-md" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  {c.id === optimisticId && <Check className="size-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="my-1.5" />
            <DropdownMenuItem
              onClick={() => router.push("/create-campaign?new=1")}
              className="gap-2.5 rounded-lg p-2 font-medium text-primary"
            >
              <span className="flex size-7 items-center justify-center rounded-md border border-dashed border-primary/40 bg-accent">
                <Plus className="size-4" />
              </span>
              Create new campaign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
