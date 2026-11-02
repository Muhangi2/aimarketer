import "server-only"
import { tool, type RunContext } from "@openai/agents"
import { z } from "zod"

/*
 * Function tools for small local models (qwen 4B/7B on Ollama). They often send almost-right
 * arguments: numbers as strings, "Instagram" for "instagram", a comma list instead of an array,
 * camelCase keys, or everything wrapped in {"arguments": {...}}. A strict Zod tool rejects all of
 * that and the model wastes turns. These tools send a plain JSON schema (non-strict), repair the
 * arguments against the Zod schema, then validate. A bad call comes back as a short message the
 * model can fix; it never throws.
 */

type AnyZod = z.ZodType
type Def = { type: string; innerType?: AnyZod; element?: AnyZod; shape?: Record<string, AnyZod>; entries?: Record<string, string> }

const defOf = (schema: AnyZod) => (schema as unknown as { def: Def }).def
const WRAPPERS = new Set(["optional", "nullable", "default", "catch", "readonly", "prefault", "nonoptional"])
const keyForm = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "")
const enumForm = (value: string) => value.trim().toLowerCase().replace(/^#/, "").replace(/[\s-]+/g, "_")

function unwrap(schema: AnyZod) {
  let current = schema
  let nullable = false
  for (let def = defOf(current); WRAPPERS.has(def.type) && def.innerType; def = defOf(current)) {
    if (def.type === "nullable" || def.type === "optional" || def.type === "default") nullable = true
    current = def.innerType
  }
  return { inner: current, nullable }
}

function parseJsonish(value: string) {
  const text = value.trim()
  if (!/^[[{]/.test(text)) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/** Repairs one value so it has the type the schema expects. Leaves anything it can't fix as is. */
function repair(schema: AnyZod, value: unknown): unknown {
  const { inner, nullable } = unwrap(schema)
  if (value === undefined || value === null) return value
  // An empty or "null" string for an optional field means "not given"
  if (nullable && typeof value === "string" && /^(|null|none|n\/a|undefined)$/i.test(value.trim())) return null
  const def = defOf(inner)

  switch (def.type) {
    case "number": {
      const n = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value.replace(/[^\d.+-]/g, "")) : Number.NaN
      if (Number.isNaN(n)) return value
      const isInt = (inner as unknown as { format?: string | null }).format?.includes("int")
      return isInt ? Math.round(n) : n
    }
    case "string":
      if (typeof value === "string") return value
      if (typeof value === "number" || typeof value === "boolean") return String(value)
      if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ")
      return JSON.stringify(value)
    case "boolean":
      if (typeof value === "string") return /^(true|yes|1|y)$/i.test(value.trim())
      return typeof value === "number" ? value !== 0 : value
    case "enum": {
      if (typeof value !== "string") return value
      const options = Object.values(def.entries ?? {})
      const wanted = enumForm(value)
      return (
        options.find((o) => o === value) ??
        options.find((o) => enumForm(o) === wanted) ??
        // "content idea" -> content_idea, "IG" won't match and falls to .catch() or an error
        options.find((o) => wanted.length >= 3 && (enumForm(o).startsWith(wanted) || wanted.startsWith(enumForm(o)))) ??
        value
      )
    }
    case "array": {
      let list: unknown = value
      if (typeof list === "string") {
        const parsed = parseJsonish(list)
        list = Array.isArray(parsed)
          ? parsed
          : list
              .split(/[\n,]+/)
              .map((s) => s.replace(/^\s*[-*•]\s*/, "").trim())
              .filter(Boolean)
      }
      if (!Array.isArray(list)) list = [list]
      return def.element ? (list as unknown[]).map((item) => repair(def.element!, item)) : list
    }
    case "object": {
      const obj = typeof value === "string" ? parseJsonish(value) : value
      return obj && typeof obj === "object" && !Array.isArray(obj) && def.shape ? repairObject(def.shape, obj as Record<string, unknown>) : value
    }
    default:
      return value
  }
}

function repairObject(shape: Record<string, AnyZod>, input: Record<string, unknown>) {
  const byForm = new Map(Object.keys(shape).map((k) => [keyForm(k), k]))
  const out: Record<string, unknown> = {}
  for (const [rawKey, value] of Object.entries(input)) {
    // "aspectRatio" or "Aspect Ratio" -> aspect_ratio
    const key = rawKey in shape ? rawKey : byForm.get(keyForm(rawKey))
    if (key && !(key in out)) out[key] = repair(shape[key], value)
  }
  return out
}

/** Turns whatever the model sent into an object the schema can validate. */
export function repairArguments(schema: z.ZodObject, raw: unknown): Record<string, unknown> {
  let input = typeof raw === "string" ? (parseJsonish(raw) ?? {}) : raw
  if (!input || typeof input !== "object" || Array.isArray(input)) input = {}
  const shape = defOf(schema).shape ?? {}
  let obj = input as Record<string, unknown>
  // {"arguments": {...}} / {"parameters": {...}} / {"input": "{...}"} wrappers
  const keys = Object.keys(obj)
  if (keys.length === 1 && !(keys[0] in shape) && /^(arguments|parameters|params|input|args|properties)$/i.test(keys[0])) {
    const inner = typeof obj[keys[0]] === "string" ? parseJsonish(obj[keys[0]] as string) : obj[keys[0]]
    if (inner && typeof inner === "object" && !Array.isArray(inner)) obj = inner as Record<string, unknown>
  }
  return repairObject(shape, obj)
}

function describeIssues(error: z.ZodError) {
  return error.issues
    .slice(0, 4)
    .map((issue) => {
      const field = issue.path.join(".") || "arguments"
      if (issue.code === "invalid_value" && "values" in issue) return `${field} must be one of: ${(issue.values as unknown[]).join(", ")}`
      if (issue.code === "invalid_type" && issue.input === undefined) return `${field} is required`
      return `${field}: ${issue.message}`
    })
    .join("; ")
}

// Small models read every token of the schema: drop safe-integer bounds and "X or null" wrappers
function simplify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplify)
  if (!node || typeof node !== "object") return node
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if ((key === "minimum" || key === "maximum") && Math.abs(Number(value)) >= Number.MAX_SAFE_INTEGER) continue
    out[key] = simplify(value)
  }
  const anyOf = out.anyOf as Record<string, unknown>[] | undefined
  if (anyOf?.length === 2 && anyOf.some((o) => o.type === "null")) {
    const { anyOf: _drop, ...rest } = out
    return { ...anyOf.find((o) => o.type !== "null"), ...rest }
  }
  if (Array.isArray(out.type) && out.type.length === 2 && out.type.includes("null")) out.type = out.type.find((t) => t !== "null")
  return out
}

/** Plain JSON schema for the model: no $schema, extra keys allowed (we drop them ourselves). */
function jsonSchemaFor(schema: z.ZodObject) {
  const json = simplify(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" })) as Record<string, unknown>
  delete json.$schema
  return {
    ...json,
    type: "object" as const,
    properties: (json.properties ?? {}) as Record<string, never>,
    required: (json.required ?? []) as string[],
    additionalProperties: true as const,
  }
}

type Parsed<S extends z.ZodObject> = z.output<S>

export type LenientResult<S extends z.ZodObject> = { ok: true; value: Parsed<S> } | { ok: false; message: string }

export function parseLenient<S extends z.ZodObject>(name: string, schema: S, raw: unknown): LenientResult<S> {
  const result = schema.safeParse(repairArguments(schema, raw))
  if (result.success) return { ok: true, value: result.data }
  return { ok: false, message: `The ${name} call had invalid arguments (${describeIssues(result.error)}). Fix them and call ${name} again.` }
}

/**
 * A function tool that accepts loose arguments. `execute` and `needsApproval` get the repaired,
 * validated input; invalid input never reaches them.
 */
export function lenientTool<S extends z.ZodObject, C = unknown>(options: {
  name: string
  description: string
  parameters: S
  execute: (input: Parsed<S>, ctx: RunContext<C> | undefined) => Promise<string> | string
  needsApproval?: (ctx: RunContext<C>, input: Parsed<S>) => Promise<boolean>
  errorFunction?: (ctx: unknown, error: unknown) => string
}) {
  const { name, parameters } = options
  const approval = options.needsApproval
  return tool({
    name,
    description: options.description,
    parameters: jsonSchemaFor(parameters),
    strict: false,
    errorFunction: options.errorFunction,
    ...(approval
      ? {
          needsApproval: async (ctx: RunContext, raw: unknown) => {
            const parsed = parseLenient(name, parameters, raw)
            // Invalid input runs (and returns the fix-it message) instead of pausing
            return parsed.ok ? approval(ctx as RunContext<C>, parsed.value) : false
          },
        }
      : {}),
    execute: async (raw: unknown, ctx?: RunContext) => {
      const parsed = parseLenient(name, parameters, raw)
      if (!parsed.ok) return parsed.message
      return options.execute(parsed.value, ctx as RunContext<C> | undefined)
    },
  })
}
