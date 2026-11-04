"use client"

import { useRouter } from "next/navigation"
import { Bot, ChevronDown, PenLine, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

const OPTIONS = [
  {
    href: "/dashboard/posts/new",
    label: "Create manually",
    description: "Write, design and schedule it yourself",
    Icon: PenLine,
    tone: "bg-brand/12 text-brand dark:text-brand-glow",
  },
  {
    href: "/dashboard/agent",
    label: "Create using AI agent",
    description: "Brief your agents and let them draft it",
    Icon: Bot,
    tone: "bg-brand/12 text-brand dark:text-brand-glow",
  },
]

export function CreatePostMenu({ size = "lg" }: { size?: "default" | "lg" }) {
  const router = useRouter()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size={size} className="gap-1.5 px-3 shadow-sm" />}>
        <Plus data-icon="inline-start" /> Create post <ChevronDown data-icon="inline-end" className="opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72 rounded-xl p-1.5">
        {OPTIONS.map(({ href, label, description, Icon, tone }) => (
          <DropdownMenuItem key={href} onClick={() => router.push(href)} className="gap-3 rounded-lg p-2.5">
            <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-muted-foreground">{description}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
