import type { SocialAccount } from "@/lib/integrations/types"

/*
 * Which service an account publishes through. Post targets and composer account ids are stored as
 * "zernio:<id>" or "blotato:<id>"; older posts saved a bare Blotato id. Safe to import from client code.
 */

export const PUBLISHING_PROVIDERS = ["zernio", "blotato"] as const
export type PublishingProvider = (typeof PUBLISHING_PROVIDERS)[number]

export const encodeTarget = (provider: PublishingProvider, accountId: string) => `${provider}:${accountId}`

export function parseTarget(value: string): { provider: PublishingProvider; accountId: string } {
  const [prefix, ...rest] = value.split(":")
  if ((PUBLISHING_PROVIDERS as readonly string[]).includes(prefix) && rest.length) return { provider: prefix as PublishingProvider, accountId: rest.join(":") }
  return { provider: "blotato", accountId: value }
}

export type PublishingAccount = SocialAccount & { provider: PublishingProvider }

/**
 * Every account a post can go to, Zernio's first (it's the main way to publish), with ids encoded
 * so the composer and the publish job know which service to use.
 */
export function publishingAccounts(zernio: SocialAccount[], blotato: SocialAccount[]): PublishingAccount[] {
  return [
    ...zernio.filter((a) => !a.needsReconnection).map((a) => ({ ...a, id: encodeTarget("zernio", a.id), provider: "zernio" as const })),
    ...blotato.map((a) => ({ ...a, id: encodeTarget("blotato", a.id), provider: "blotato" as const })),
  ]
}
