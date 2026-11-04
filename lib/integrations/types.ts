/* Shapes shared by the social posting integrations (Blotato, Postiz). Never includes an API key. */

export const INTEGRATION_PROVIDERS = ["blotato", "postiz"] as const
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number]

export type SocialAccount = {
  // The provider's account/channel id (Blotato's post.accountId)
  id: string
  // Normalized platform: instagram, tiktok, youtube, twitter, linkedin…
  platform: string
  fullname: string
  username: string
  picture?: string | null
  // The platform revoked access; the user has to connect it again
  needsReconnection?: boolean
}

export type IntegrationConnection = {
  keyHint: string
  plan: string | null
  status: "active" | "invalid"
  accounts: SocialAccount[]
  accountsRefreshedAt: string | null
  lastError: string | null
  connectedAt: string
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "X (Twitter)",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  threads: "Threads",
  pinterest: "Pinterest",
  bluesky: "Bluesky",
  mastodon: "Mastodon",
  reddit: "Reddit",
  discord: "Discord",
  telegram: "Telegram",
}

export const platformLabel = (platform: string) => PLATFORM_LABELS[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1)
