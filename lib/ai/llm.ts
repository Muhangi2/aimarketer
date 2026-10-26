import "server-only"
import type OpenAI from "openai"
import { z } from "zod"
import { AI_MODEL, aiClient } from "@/lib/ai/client"

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam

export class ModelUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The AI model is unavailable. Check that the model server is running.", { cause })
    this.name = "ModelUnavailableError"
  }
}

export class ModelFormatError extends Error {
  constructor(detail: string) {
    super(`The AI model returned an answer in the wrong format (${detail}).`)
    this.name = "ModelFormatError"
  }
}

async function complete(messages: ChatMessage[], options: { temperature?: number; json?: boolean; signal?: AbortSignal }) {
  try {
    const res = await aiClient.chat.completions.create(
      {
        model: AI_MODEL,
        messages,
        temperature: options.temperature ?? 0.4,
        ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
      },
      { signal: options.signal }
    )
    return res.choices[0]?.message?.content?.trim() ?? ""
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new ModelUnavailableError(error)
  }
}

/** One plain-text completion. Retries once on a connection failure. */
export async function completeText(messages: ChatMessage[], options: { temperature?: number; signal?: AbortSignal } = {}) {
  try {
    return await complete(messages, options)
  } catch (error) {
    if (!(error instanceof ModelUnavailableError)) throw error
    return complete(messages, options)
  }
}

// Small models sometimes wrap JSON in code fences or add a sentence around it
function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf("{")
  const end = body.lastIndexOf("}")
  if (start === -1 || end <= start) throw new ModelFormatError("no JSON object")
  return JSON.parse(body.slice(start, end + 1)) as unknown
}

/**
 * Asks for a JSON object and validates it against the schema. On a malformed answer the model
 * is shown its mistake and asked again, up to `attempts` times.
 */
export async function completeJSON<T>(
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  options: { temperature?: number; signal?: AbortSignal; attempts?: number } = {}
): Promise<T> {
  const conversation = [...messages]
  const attempts = options.attempts ?? 2
  let lastProblem = "unknown"

  for (let attempt = 0; attempt < attempts; attempt++) {
    const request = { temperature: options.temperature ?? 0.2, signal: options.signal }
    const text = await complete(conversation, { ...request, json: true }).catch((error) => {
      // Some OpenAI-compatible servers reject response_format (or the call failed once): retry in plain mode
      if (error instanceof ModelUnavailableError) return complete(conversation, request)
      throw error
    })
    try {
      const parsed = schema.safeParse(extractJson(text))
      if (parsed.success) return parsed.data
      lastProblem = parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ")
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : "invalid JSON"
    }
    conversation.push(
      { role: "assistant", content: text || "(empty)" },
      { role: "user", content: `That answer was not valid (${lastProblem}). Reply again with only the JSON object in the exact format requested.` }
    )
  }
  throw new ModelFormatError(lastProblem)
}
