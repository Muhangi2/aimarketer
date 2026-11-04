import "server-only"
import OpenAI from "openai"
import { OpenAIChatCompletionsModel, setTracingDisabled, type Model, type ModelRequest, type ModelResponse, type StreamEvent } from "@openai/agents"

// Tracing uploads runs to the OpenAI dashboard, which a local model has no use for
setTracingDisabled(true)

/**
 * Any OpenAI-compatible endpoint works. Defaults to a local Ollama server;
 * point AI_BASE_URL / AI_API_KEY / AI_MODEL at OpenAI or another provider to switch.
 */
export const AI_MODEL = process.env.AI_MODEL ?? "qwen2.5-coder:7b"

const globalForAI = globalThis as { aiClient?: OpenAI }

// One client per server process (survives dev hot reloads)
export const aiClient = (globalForAI.aiClient ??= new OpenAI({
  baseURL: process.env.AI_BASE_URL ?? "http://localhost:11434/v1",
  // Ollama ignores the key, but the client requires one
  apiKey: process.env.AI_API_KEY ?? "ollama",
}))

export function chatModel() {
  // Ollama speaks the Chat Completions API
  return new OpenAIChatCompletionsModel(aiClient, AI_MODEL)
}

/**
 * Computer agents (Research, Creator) read screenshots and call tools, so they need a fast vision
 * model. COMPUTER_MODEL picks it (defaults to AI_MODEL). COMPUTER_BASE_URL / COMPUTER_API_KEY put
 * them on another OpenAI-compatible endpoint than the rest of the team, e.g. Gemini's
 * https://generativelanguage.googleapis.com/v1beta/openai/ with gemini-3.1-flash-lite.
 */
export const COMPUTER_MODEL = process.env.COMPUTER_MODEL || AI_MODEL
// Used for a call when COMPUTER_MODEL is overloaded or down (503, 429, timeout). Same endpoint
// unless COMPUTER_FALLBACK_BASE_URL is set. Unset: no fallback.
const fallbackModelName = () => process.env.COMPUTER_FALLBACK_MODEL || null

// A stuck request fails after this long instead of holding the step for minutes
const COMPUTER_TIMEOUT_MS = 90_000

const globalForComputer = globalThis as { computerClients?: Record<string, OpenAI> }
const computerClients = (globalForComputer.computerClients ??= {})

function computerClientFor(baseURL: string | undefined, retries: number) {
  if (!baseURL) return aiClient
  const key = `${baseURL}|${retries}`
  return (computerClients[key] ??= new OpenAI({
    baseURL,
    apiKey: process.env.COMPUTER_API_KEY || process.env.AI_API_KEY || "none",
    // Free tiers rate-limit: wait and retry instead of failing the step
    maxRetries: retries,
    timeout: COMPUTER_TIMEOUT_MS,
  }))
}

/** The provider is overloaded, rate-limiting or not answering: another model may still work. */
export function isModelUnavailable(error: unknown) {
  const e = error as { status?: number; name?: string; message?: string } | null
  if (!e) return false
  if (typeof e.status === "number" && [429, 500, 502, 503, 504].includes(e.status)) return true
  return /timed? ?out|timeout|overloaded|high demand|UNAVAILABLE|ECONNRESET|ECONNREFUSED/i.test(`${e.name ?? ""} ${e.message ?? ""}`)
}

/** Tries the primary model; when it's unavailable, sends the same request to the fallback. */
class FallbackModel implements Model {
  constructor(
    private readonly primary: Model,
    private readonly fallback: Model,
    private readonly names: { primary: string; fallback: string }
  ) {}

  async getResponse(request: ModelRequest): Promise<ModelResponse> {
    try {
      return await this.primary.getResponse(request)
    } catch (error) {
      if (!isModelUnavailable(error)) throw error
      console.warn(`[ai] ${this.names.primary} is unavailable (${(error as Error).message?.slice(0, 120)}); using ${this.names.fallback}`)
      return this.fallback.getResponse(request)
    }
  }

  async *getStreamedResponse(request: ModelRequest): AsyncIterable<StreamEvent> {
    let started = false
    try {
      for await (const event of this.primary.getStreamedResponse(request)) {
        started = true
        yield event
      }
    } catch (error) {
      // Once events went out the turn can't be replayed on another model
      if (started || !isModelUnavailable(error)) throw error
      console.warn(`[ai] ${this.names.primary} is unavailable; streaming with ${this.names.fallback}`)
      yield* this.fallback.getStreamedResponse(request)
    }
  }
}

export function computerModel(): Model {
  const base = process.env.COMPUTER_BASE_URL
  const fallbackName = fallbackModelName()
  if (!fallbackName || fallbackName === COMPUTER_MODEL) {
    return new OpenAIChatCompletionsModel(computerClientFor(base, 6), COMPUTER_MODEL)
  }
  // With a fallback, give up on the busy model quickly instead of retrying it for minutes
  const primary = new OpenAIChatCompletionsModel(computerClientFor(base, 1), COMPUTER_MODEL)
  const fallback = new OpenAIChatCompletionsModel(computerClientFor(process.env.COMPUTER_FALLBACK_BASE_URL || base, 4), fallbackName)
  return new FallbackModel(primary, fallback, { primary: COMPUTER_MODEL, fallback: fallbackName })
}
