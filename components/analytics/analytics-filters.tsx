"use client"

import { useState } from "react"
import { CalendarRange, Check, ChevronDown, Layers } from "lucide-react"
import { cn } from "cn"
import { MAX_RANGE_DAYS, RANGE_PRESETS, type RangePreset } from "@/lib/analytics/types"
import { daysBetween } from "@/lib/analytics/compute"
import { CampaignIcon } from "@/components/campaign/campaign-icon"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatSpan } from "@/components/analytics/parts"

export type RangeChoice = { kind: "preset"; key: RangePreset; days: number } | { kind: "custom"; from: string; to: string }
export type CampaignOption = { id: string; name: string; iconType: "preset" | "custom"; icon: string }

/** Date range: presets as rows, a custom range behind a hairline. */
export function RangePicker({ range, label, today, onChange }: { range: RangeChoice; label: string; today: string; onChange: (r: RangeChoice) => void }) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(range.kind === "custom" ? range.from : "")
  const [to, setTo] = useState(range.kind === "custom" ? range.to : "")
  const days = from && to && from <= to ? daysBetween(from, to) : 0
  const problem = !from || !to ? null : from > to ? "The start must be before the end." : days > MAX_RANGE_DAYS ? "Pick at most 366 days." : to > today ? "The end can't be in the future." : null

  const pick = (r: RangeChoice) => {
    setOpen(false)
    onChange(r)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" className="h-9 gap-2 rounded-xl bg-card font-normal shadow-xs" />}>
        <CalendarRange className="size-4 text-muted-foreground" />
        <span className="font-medium">{label}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0 p-1.5">
        {RANGE_PRESETS.map((p) => {
          const selected = range.kind === "preset" && range.key === p.key
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => pick({ kind: "preset", key: p.key, days: p.days })}
              className={cn("flex items-center justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-muted/70", selected && "font-semibold")}
            >
              {p.label}
              {selected && <Check className="size-4" strokeWidth={3} />}
            </button>
          )
        })}
        <div className="mt-1.5 border-t px-1 pt-2.5 pb-1">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" aria-label="From" value={from} max={to || today} onChange={(e) => setFrom(e.target.value)} className="h-8 px-2 text-xs" />
            <Input type="date" aria-label="To" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="h-8 px-2 text-xs" />
          </div>
          {problem && <p className="mt-1.5 text-xs text-destructive">{problem}</p>}
          <Button size="sm" className="mt-2 w-full" disabled={!days || Boolean(problem)} onClick={() => pick({ kind: "custom", from, to })}>
            {days && !problem ? `Show ${formatSpan(from, to)}` : "Apply"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** One campaign, or every post on the connected accounts. */
export function CampaignPicker({ campaigns, value, onChange }: { campaigns: CampaignOption[]; value: string | null; onChange: (id: string | null) => void }) {
  const active = campaigns.find((c) => c.id === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="h-9 max-w-64 gap-2 rounded-xl bg-card font-normal shadow-xs" />}>
        {active ? <CampaignIcon type={active.iconType} icon={active.icon} className="size-5 shrink-0 rounded-md" /> : <Layers className="size-4 text-muted-foreground" />}
        <span className="truncate font-medium">{active?.name ?? "All campaigns"}</span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Show analytics for</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onChange(null)} className="gap-2">
            <Layers className="size-4 text-muted-foreground" />
            <span className="flex-1">
              All campaigns
              <span className="block text-xs text-muted-foreground">Includes posts made outside the app</span>
            </span>
            {value === null && <Check className="size-4" strokeWidth={3} />}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {campaigns.map((c) => (
            <DropdownMenuItem key={c.id} onClick={() => onChange(c.id)} className="gap-2">
              <CampaignIcon type={c.iconType} icon={c.icon} className="size-5 shrink-0 rounded-md" />
              <span className="flex-1 truncate">{c.name}</span>
              {c.id === value && <Check className="size-4" strokeWidth={3} />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
