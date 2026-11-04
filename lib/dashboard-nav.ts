import {
  BarChart3,
  Bot,
  CalendarDays,
  Inbox,
  LayoutDashboard,
  PenSquare,
  Settings,
  Share2,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  slug: string
  href: string
  label: string
  description: string
  Icon: LucideIcon
  // Tinted chip when idle, solid chip when active
  tone: string
  activeTone: string
}

export const DASHBOARD_NAV: NavItem[] = [
  {
    slug: "",
    href: "/dashboard",
    label: "Overview",
    description: "Your campaign at a glance",
    Icon: LayoutDashboard,
    tone: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
    activeTone: "bg-blue-600 text-white shadow-blue-600/30",
  },
  {
    slug: "agent",
    href: "/dashboard/agent",
    label: "AI Agent",
    description: "Brief and manage your AI marketing agents",
    Icon: Bot,
    tone: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
    activeTone: "bg-violet-600 text-white shadow-violet-600/30",
  },
  {
    slug: "posts",
    href: "/dashboard/posts",
    label: "Posts",
    description: "Drafts, approvals and published content",
    Icon: PenSquare,
    tone: "bg-pink-500/12 text-pink-600 dark:text-pink-400",
    activeTone: "bg-pink-600 text-white shadow-pink-600/30",
  },
  {
    slug: "inbox",
    href: "/dashboard/inbox",
    label: "Inbox",
    description: "Comments and messages from your accounts",
    Icon: Inbox,
    tone: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
    activeTone: "bg-indigo-600 text-white shadow-indigo-600/30",
  },
  {
    slug: "calendar",
    href: "/dashboard/calendar",
    label: "Calendar",
    description: "Plan and schedule posts across channels",
    Icon: CalendarDays,
    tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    activeTone: "bg-amber-500 text-white shadow-amber-500/30",
  },
  {
    slug: "analytics",
    href: "/dashboard/analytics",
    label: "Analytics",
    description: "Reach, engagement and growth",
    Icon: BarChart3,
    tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    activeTone: "bg-emerald-600 text-white shadow-emerald-600/30",
  },
  {
    slug: "accounts",
    href: "/dashboard/accounts",
    label: "Accounts",
    description: "Connected social media accounts",
    Icon: Share2,
    tone: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
    activeTone: "bg-sky-600 text-white shadow-sky-600/30",
  },
  {
    slug: "settings",
    href: "/dashboard/settings",
    label: "Settings",
    description: "Campaign and workspace preferences",
    Icon: Settings,
    tone: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
    activeTone: "bg-slate-700 text-white shadow-slate-700/30",
  },
]

export function findNavItem(pathname: string) {
  return (
    DASHBOARD_NAV.find((item) => item.slug && (pathname === item.href || pathname.startsWith(`${item.href}/`))) ??
    DASHBOARD_NAV[0]
  )
}
