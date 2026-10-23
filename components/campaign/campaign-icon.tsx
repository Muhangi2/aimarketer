import {
  Camera,
  Coffee,
  Globe,
  Heart,
  Megaphone,
  Music,
  Rocket,
  ShoppingBag,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"

export const PRESET_ICONS: { id: string; label: string; Icon: LucideIcon; tone: string }[] = [
  { id: "rocket", label: "Launch", Icon: Rocket, tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400" },
  { id: "megaphone", label: "Announce", Icon: Megaphone, tone: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  { id: "sparkles", label: "Brand", Icon: Sparkles, tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { id: "trending-up", label: "Growth", Icon: TrendingUp, tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { id: "target", label: "Ads", Icon: Target, tone: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  { id: "heart", label: "Community", Icon: Heart, tone: "bg-pink-500/15 text-pink-600 dark:text-pink-400" },
  { id: "shopping-bag", label: "Shop", Icon: ShoppingBag, tone: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  { id: "camera", label: "Content", Icon: Camera, tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" },
  { id: "music", label: "Music", Icon: Music, tone: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400" },
  { id: "coffee", label: "Food", Icon: Coffee, tone: "bg-yellow-700/15 text-yellow-800 dark:text-yellow-500" },
  { id: "zap", label: "Promo", Icon: Zap, tone: "bg-lime-500/15 text-lime-700 dark:text-lime-400" },
  { id: "globe", label: "Global", Icon: Globe, tone: "bg-teal-500/15 text-teal-600 dark:text-teal-400" },
]

export function isPresetIcon(id: string) {
  return PRESET_ICONS.some((p) => p.id === id)
}

export function CampaignIcon({
  type,
  icon,
  className,
}: {
  type: "preset" | "custom"
  icon: string
  className?: string
}) {
  if (type === "custom") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={icon} alt="" className={cn("size-10 rounded-xl object-cover", className)} />
    )
  }

  const preset = PRESET_ICONS.find((p) => p.id === icon) ?? PRESET_ICONS[0]
  return (
    <span className={cn("flex size-10 items-center justify-center rounded-xl", preset.tone, className)}>
      <preset.Icon className="size-1/2" />
    </span>
  )
}
