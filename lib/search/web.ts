import "server-only"

/*
 * Text web search for the agents: one API call returns titles, links and snippets, so a simple
 * lookup (trending hashtags, recent news) doesn't need the desktop browser and its screenshots.
 *
 * SEARCH_PROVIDER picks the first provider to try; the others are fallbacks, skipped when their
 * keys aren't set:
 *   tavily: TAVILY_API_KEY (free monthly allowance, https://tavily.com)
 *   firecrawl: FIRECRAWL_API_KEY (free monthly credits, https://firecrawl.dev; also reads pages, see ./scrape)
 *   brave:  BRAVE_SEARCH_API_KEY (https://brave.com/search/api)
 *   serper: SERPER_API_KEY, Google results (https://serper.dev)
 *   gemini: Gemini with Google Search grounding, GEMINI_API_KEY. Opt-in with GEMINI_SEARCH_MODEL:
 *           the free tier usually has no grounding quota.
 */

export type SearchProvider = "tavily" | "firecrawl" | "brave" | "serper" | "gemini"
export type Freshness = "any" | "day" | "week" | "month" | "year"
export type SearchResult = { title: string; url: string; snippet: string; date: string | null }
export type SearchResponse = { provider: SearchProvider; answer: string | null; results: SearchResult[] }

const PROVIDERS: SearchProvider[] = ["tavily", "firecrawl", "brave", "serper", "gemini"]
const TIMEOUT_MS = 20_000
const SNIPPET_CHARS = 400

function configured(provider: SearchProvider) {
  if (provider === "tavily") return Boolean(process.env.TAVILY_API_KEY)
  if (provider === "firecrawl") return Boolean(process.env.FIRECRAWL_API_KEY)
  if (provider === "brave") return Boolean(process.env.BRAVE_SEARCH_API_KEY)
  if (provider === "serper") return Boolean(process.env.SERPER_API_KEY)
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_SEARCH_MODEL)
}

/** Providers to try, in order: SEARCH_PROVIDER first, then the rest that have keys. */
export function searchProviders(): SearchProvider[] {
  const preferred = process.env.SEARCH_PROVIDER?.toLowerCase() as SearchProvider | undefined
  const first = preferred && PROVIDERS.includes(preferred) ? [preferred] : []
  return [...first, ...PROVIDERS.filter((p) => !first.includes(p))].filter(configured)
}

export const textSearchAvailable = () => searchProviders().length > 0

const clean = (text: unknown) =>
  String(text ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SNIPPET_CHARS)

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data?.error ?? data?.detail ?? data?.message ?? "").slice(0, 200)}`)
  return data ?? {}
}

async function withTavily(query: string, freshness: Freshness, count: number, news: boolean): Promise<SearchResponse> {
  const data = await postJson(
    "https://api.tavily.com/search",
    { Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    {
      query,
      max_results: count,
      search_depth: "basic",
      include_answer: true,
      topic: news ? "news" : "general",
      ...(freshness !== "any" ? { time_range: freshness } : {}),
    }
  )
  const results = ((data.results as Array<Record<string, unknown>>) ?? []).map((r) => ({
    title: clean(r.title),
    url: String(r.url ?? ""),
    snippet: clean(r.content),
    date: r.published_date ? String(r.published_date) : null,
  }))
  return { provider: "tavily", answer: data.answer ? clean(data.answer) : null, results }
}

const BRAVE_FRESHNESS: Record<Freshness, string | null> = { any: null, day: "pd", week: "pw", month: "pm", year: "py" }

async function withBrave(query: string, freshness: Freshness, count: number, news: boolean): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query, count: String(count) })
  if (BRAVE_FRESHNESS[freshness]) params.set("freshness", BRAVE_FRESHNESS[freshness]!)
  const res = await fetch(`https://api.search.brave.com/res/v1/${news ? "news" : "web"}/search?${params}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const list = (news ? data?.results : (data?.web as Record<string, unknown> | undefined)?.results) as Array<Record<string, unknown>> | undefined
  const results = (list ?? []).map((r) => ({
    title: clean(r.title),
    url: String(r.url ?? ""),
    snippet: clean(r.description),
    date: r.age ? String(r.age) : null,
  }))
  return { provider: "brave", answer: null, results }
}

// Firecrawl and Serper take Google's time filter
const SERPER_FRESHNESS: Record<Freshness, string | null> = { any: null, day: "qdr:d", week: "qdr:w", month: "qdr:m", year: "qdr:y" }

async function withSerper(query: string, freshness: Freshness, count: number, news: boolean): Promise<SearchResponse> {
  const data = await postJson(
    `https://google.serper.dev/${news ? "news" : "search"}`,
    { "X-API-KEY": process.env.SERPER_API_KEY! },
    { q: query, num: count, ...(SERPER_FRESHNESS[freshness] ? { tbs: SERPER_FRESHNESS[freshness] } : {}) }
  )
  const list = (news ? data.news : data.organic) as Array<Record<string, unknown>> | undefined
  const results = (list ?? []).map((r) => ({
    title: clean(r.title),
    url: String(r.link ?? ""),
    snippet: clean(r.snippet),
    date: r.date ? String(r.date) : null,
  }))
  const box = data.answerBox as Record<string, unknown> | undefined
  return { provider: "serper", answer: box ? clean(box.answer ?? box.snippet) || null : null, results }
}

async function withFirecrawl(query: string, freshness: Freshness, count: number, news: boolean): Promise<SearchResponse> {
  const data = await postJson(
    "https://api.firecrawl.dev/v2/search",
    { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` },
    { query, limit: count, sources: [news ? "news" : "web"], ...(SERPER_FRESHNESS[freshness] ? { tbs: SERPER_FRESHNESS[freshness] } : {}) }
  )
  const found = (data.data ?? {}) as Record<string, Array<Record<string, unknown>> | undefined>
  const results = (found[news ? "news" : "web"] ?? []).map((r) => ({
    title: clean(r.title),
    url: String(r.url ?? ""),
    snippet: clean(r.description ?? r.snippet),
    date: r.date ? String(r.date) : null,
  }))
  return { provider: "firecrawl", answer: null, results }
}

async function withGemini(query: string, freshness: Freshness, count: number): Promise<SearchResponse> {
  const when = freshness === "any" ? "" : ` Only use information from the past ${freshness}.`
  const data = await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_SEARCH_MODEL}:generateContent`,
    { "x-goog-api-key": process.env.GEMINI_API_KEY! },
    {
      contents: [{ parts: [{ text: `Search the web and answer briefly with facts and names, no filler: ${query}${when}` }] }],
      tools: [{ google_search: {} }],
    }
  )
  type Candidate = {
    content?: { parts?: Array<{ text?: string }> }
    groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> }
  }
  const candidate = (data.candidates as Candidate[] | undefined)?.[0]
  const answer = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim()
  // Grounding links are Google redirect URLs; the title is the source's site
  const results = (candidate?.groundingMetadata?.groundingChunks ?? [])
    .filter((c) => c.web?.uri)
    .slice(0, count)
    .map((c) => ({ title: clean(c.web!.title), url: c.web!.uri!, snippet: "", date: null }))
  return { provider: "gemini", answer: answer ? answer.slice(0, 2000) : null, results }
}

/** Searches with the first provider that answers. Throws when none is set up or all of them fail. */
export async function searchWeb(query: string, options: { freshness?: Freshness; count?: number; news?: boolean } = {}) {
  const freshness = options.freshness ?? "any"
  const count = Math.min(Math.max(options.count ?? 8, 1), 10)
  const news = options.news ?? false
  const order = searchProviders()
  if (order.length === 0) throw new Error("No text search provider is set up (TAVILY_API_KEY, FIRECRAWL_API_KEY, BRAVE_SEARCH_API_KEY or SERPER_API_KEY).")
  const problems: string[] = []
  for (const provider of order) {
    try {
      const response =
        provider === "tavily"
          ? await withTavily(query, freshness, count, news)
          : provider === "firecrawl"
            ? await withFirecrawl(query, freshness, count, news)
            : provider === "brave"
            ? await withBrave(query, freshness, count, news)
            : provider === "serper"
              ? await withSerper(query, freshness, count, news)
              : await withGemini(query, freshness, count)
      response.results = response.results.filter((r) => /^https?:\/\//.test(r.url))
      if (response.results.length > 0 || response.answer) return response
      problems.push(`${provider}: no results`)
    } catch (error) {
      problems.push(`${provider}: ${error instanceof Error ? error.message : String(error)}`)
      console.warn(`[search] ${provider} failed`, error)
    }
  }
  throw new Error(problems.join("; ").slice(0, 400))
}
