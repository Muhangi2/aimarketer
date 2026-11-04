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
  { id: "rocket", label: "Launch", Icon: Rocket, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  { id: "megaphone", label: "Announce", Icon: Megaphone, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  { id: "sparkles", label: "Brand", Icon: Sparkles, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  { id: "trending-up", label: "Growth", Icon: TrendingUp, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  { id: "target", label: "Ads", Icon: Target, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  { id: "heart", label: "Community", Icon: Heart, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  { id: "shopping-bag", label: "Shop", Icon: ShoppingBag, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  { id: "camera", label: "Content", Icon: Camera, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  { id: "music", label: "Music", Icon: Music, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  { id: "coffee", label: "Food", Icon: Coffee, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  { id: "zap", label: "Promo", Icon: Zap, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
  { id: "globe", label: "Global", Icon: Globe, tone: "bg-brand/12 text-brand dark:text-brand-glow" },
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
