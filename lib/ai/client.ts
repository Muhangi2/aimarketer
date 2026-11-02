import "server-only"
import OpenAI from "openai"
import { OpenAIChatCompletionsModel, setTracingDisabled } from "@openai/agents"

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

const globalForComputer = globalThis as { computerClient?: OpenAI }

const computerClient = process.env.COMPUTER_BASE_URL
  ? (globalForComputer.computerClient ??= new OpenAI({
      baseURL: process.env.COMPUTER_BASE_URL,
      apiKey: process.env.COMPUTER_API_KEY || process.env.AI_API_KEY || "none",
      // Free tiers rate-limit: wait and retry instead of failing the step
      maxRetries: 6,
    }))
  : aiClient

export function computerModel() {
  return new OpenAIChatCompletionsModel(computerClient, COMPUTER_MODEL)
}
