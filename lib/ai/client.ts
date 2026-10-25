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
