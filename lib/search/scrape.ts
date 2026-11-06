import "server-only"

/*
 * Reads a web page as clean text (markdown) through Firecrawl, so read_page doesn't have to start
 * the agent's desktop. Firecrawl fetches the page from its own servers and renders JavaScript.
 * It refuses social networks (Instagram, TikTok, YouTube...): those need the desktop browser.
 */

const TIMEOUT_MS = 45_000
// Cached copies up to this old are fine and much faster
const MAX_AGE_MS = 6 * 60 * 60 * 1000

export const pageReaderAvailable = () => Boolean(process.env.FIRECRAWL_API_KEY)

export type ScrapedPage = { url: string; title: string | null; text: string }

/** Thrown when Firecrawl won't read the site at all (social networks): use the browser instead. */
export class UnsupportedSiteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsupportedSiteError"
  }
}

export async function scrapePage(url: string): Promise<ScrapedPage> {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, maxAge: MAX_AGE_MS, timeout: TIMEOUT_MS - 5000 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const body = (await res.json().catch(() => null)) as {
    success?: boolean
    error?: string
    data?: { markdown?: string; metadata?: { title?: string; sourceURL?: string; statusCode?: number } }
  } | null
  if (res.status === 403 || /do not support this site/i.test(body?.error ?? "")) throw new UnsupportedSiteError("Firecrawl doesn't read this site.")
  if (!res.ok || !body?.success) throw new Error(`Firecrawl: ${body?.error?.slice(0, 200) ?? `HTTP ${res.status}`}`)
  const status = body.data?.metadata?.statusCode
  if (status && status >= 400) throw new Error(`The page answered with HTTP ${status}.`)
  return { url: body.data?.metadata?.sourceURL ?? url, title: body.data?.metadata?.title ?? null, text: (body.data?.markdown ?? "").trim() }
}
