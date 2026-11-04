import { cn } from "cn"
import { PlatformIcon } from "@/components/posts/platform-icon"
import { PLATFORMS, isPostPlatform } from "@/lib/posts/platforms"
import { platformLabel, type SocialAccount } from "@/lib/integrations/types"

// Platforms we publish to come first, in the composer's order
const order = (platform: string) => (isPostPlatform(platform) ? ["instagram", "tiktok", "youtube"].indexOf(platform) : 10)

/**
 * Social accounts connected on a service, as cards. With publishes, Instagram/TikTok/YouTube are
 * marked as ready for scheduled posts; otherwise the accounts are just listed.
 */
export function AccountList({ accounts, publishes = true, providerName = "Blotato", className }: { accounts: SocialAccount[]; publishes?: boolean; providerName?: string; className?: string }) {
  const sorted = [...accounts].sort((a, b) => order(a.platform) - order(b.platform) || a.platform.localeCompare(b.platform))
  return (
    <ul className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {sorted.map((account, i) => {
        const supported = isPostPlatform(account.platform)
        const ready = publishes && supported
        const name = account.fullname || account.username || "Account"
        return (
          <li
            key={account.id}
            className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs animate-in fade-in slide-in-from-bottom-1 duration-300"
            style={{ animationDelay: `${Math.min(i, 12) * 30}ms`, animationFillMode: "both" }}
          >
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", supported ? PLATFORMS[account.platform as keyof typeof PLATFORMS].tone : "bg-muted text-muted-foreground")}>
              <PlatformIcon platform={account.platform} className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {platformLabel(account.platform)}
                {account.username && ` · @${account.username.replace(/^@/, "")}`}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                ready ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"
              )}
              title={
                ready
                  ? "You can schedule posts to this account"
                  : publishes
                    ? `Connected on ${providerName}, but this app doesn't post to it yet`
                    : `Your agents can read this ${providerName} channel in chat`
              }
            >
              {ready ? "Ready to post" : publishes ? "Not supported yet" : "Agent access"}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
