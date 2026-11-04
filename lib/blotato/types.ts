/* Blotato connection shapes shared by server and client code. Never includes the API key. */

export { platformLabel, type SocialAccount } from "@/lib/integrations/types"
export type { IntegrationConnection as BlotatoConnection } from "@/lib/integrations/types"

export const BLOTATO_KEYS_URL = "https://my.blotato.com/settings/api"
export const BLOTATO_DASHBOARD_URL = "https://my.blotato.com"
