import type { IntegrationProvider } from "@/lib/integrations/types"

/* What the Integrations and Accounts pages show for each service. Safe to import from client code. */

export type ProviderInfo = {
  name: string
  initial: string
  tone: string
  tagline: string
  dashboardUrl: string
  keysUrl: string
  keyPlaceholder: string
  steps: { title: string; body: string; href?: string }[]
  // Whether scheduled posts publish through it (only Blotato for now)
  publishes: boolean
  disconnectNote: string
}

export const PROVIDERS: Record<IntegrationProvider, ProviderInfo> = {
  blotato: {
    name: "Blotato",
    initial: "B",
    tone: "from-sky-500 to-violet-600",
    tagline: "Publishes and schedules your posts on Instagram, TikTok and YouTube through your own Blotato account.",
    dashboardUrl: "https://my.blotato.com",
    keysUrl: "https://my.blotato.com/settings/api",
    keyPlaceholder: "blt_…",
    steps: [
      { title: "Connect your social accounts on Blotato", body: "Instagram, TikTok and YouTube, from Blotato's dashboard.", href: "https://my.blotato.com" },
      { title: "Generate an API key", body: "Blotato → Settings → API. API access needs a paid Blotato plan.", href: "https://my.blotato.com/settings/api" },
      { title: "Paste the key here", body: "We check it, then show the accounts you connected." },
    ],
    publishes: true,
    disconnectNote: "Scheduled posts won't publish until you connect Blotato again.",
  },
  postiz: {
    name: "Postiz",
    initial: "P",
    tone: "from-fuchsia-500 to-orange-500",
    tagline: "Lets your AI agents read your Postiz channels, calendar and media library in chat (Postiz's MCP tools).",
    dashboardUrl: "https://platform.postiz.com",
    keysUrl: "https://platform.postiz.com/settings",
    keyPlaceholder: "Your Postiz API key",
    steps: [
      { title: "Connect your channels on Postiz", body: "From the Postiz app. Postiz Cloud has a 7-day trial, then paid plans.", href: "https://platform.postiz.com" },
      { title: "Copy your API key", body: "Postiz → Settings → Public API.", href: "https://platform.postiz.com/settings" },
      { title: "Paste the key here", body: "We check it, then show your Postiz channels." },
    ],
    publishes: false,
    disconnectNote: "Your agents lose access to your Postiz tools in chat.",
  },
}
