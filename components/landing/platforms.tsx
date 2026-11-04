"use client"

import {
  SiBluesky,
  SiDiscord,
  SiFacebook,
  SiInstagram,
  SiMastodon,
  SiPinterest,
  SiReddit,
  SiTelegram,
  SiThreads,
  SiTiktok,
  SiX,
  SiYoutube,
} from "@icons-pack/react-simple-icons"

type IconProps = { size?: number | string; className?: string; color?: string }

// Simple Icons no longer ships a LinkedIn mark, so draw a plain one
function LinkedinIcon({ size = 24, className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor" aria-hidden>
      {/* The "in" letters are cut out of the square so it works on any background */}
      <mask id="linkedin-cutout">
        <rect width="24" height="24" fill="white" />
        <rect x="5.2" y="9.5" width="3" height="9" fill="black" />
        <circle cx="6.7" cy="6.4" r="1.75" fill="black" />
        <path d="M11 9.5h2.8v1.3c.5-.9 1.6-1.5 3-1.5 2.4 0 3.2 1.5 3.2 4v5.2h-3v-4.6c0-1.1-.3-1.9-1.4-1.9-1.2 0-1.6.9-1.6 2v4.5h-3z" fill="black" />
      </mask>
      <rect x="1" y="1" width="22" height="22" rx="4" mask="url(#linkedin-cutout)" />
    </svg>
  )
}

export type PlatformKey =
  | "instagram"
  | "tiktok"
  | "youtube"
  | "x"
  | "linkedin"
  | "facebook"
  | "threads"
  | "pinterest"
  | "bluesky"
  | "reddit"
  | "mastodon"
  | "discord"
  | "telegram"

// Matches the platforms the integrations support (lib/integrations/types.ts)
export const PLATFORMS: { key: PlatformKey; name: string; Icon: React.ComponentType<IconProps> }[] = [
  { key: "instagram", name: "Instagram", Icon: SiInstagram },
  { key: "tiktok", name: "TikTok", Icon: SiTiktok },
  { key: "youtube", name: "YouTube", Icon: SiYoutube },
  { key: "x", name: "X", Icon: SiX },
  { key: "linkedin", name: "LinkedIn", Icon: LinkedinIcon },
  { key: "facebook", name: "Facebook", Icon: SiFacebook },
  { key: "threads", name: "Threads", Icon: SiThreads },
  { key: "pinterest", name: "Pinterest", Icon: SiPinterest },
  { key: "bluesky", name: "Bluesky", Icon: SiBluesky },
  { key: "reddit", name: "Reddit", Icon: SiReddit },
  { key: "mastodon", name: "Mastodon", Icon: SiMastodon },
  { key: "discord", name: "Discord", Icon: SiDiscord },
  { key: "telegram", name: "Telegram", Icon: SiTelegram },
]

export const platform = (key: PlatformKey) => PLATFORMS.find((p) => p.key === key)!

export function PlatformIcon({ name, className, size = 14 }: { name: PlatformKey; className?: string; size?: number }) {
  const { Icon } = platform(name)
  return <Icon size={size} className={className} color="currentColor" />
}
