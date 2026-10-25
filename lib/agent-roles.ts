export const AGENT_KEYS = ["research", "creator", "scheduler", "analytics"] as const
export type AgentKey = (typeof AGENT_KEYS)[number]

export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(value)
}

export type AgentRole = {
  // Which AI agent (lib/ai/agents.ts) answers this role's chat
  key: AgentKey
  name: string
  emoji: string
  task: string
  description: string
  greeting: string
  // Tint for the emoji chip
  tone: string
}

// One role per AI agent, assigned to office seats in order; offices with more seats wrap around
export const AGENT_ROLES: AgentRole[] = [
  {
    key: "research",
    name: "Research Agent",
    emoji: "🔍",
    task: "Finding trending topics",
    description: "Finds trending topics, news and content ideas for your niche.",
    greeting:
      "Hi! I'm your Research Agent. I can find trending topics, analyze competitors, and suggest content ideas for your campaign.\n\nWhat would you like to research today?",
    tone: "bg-sky-100 dark:bg-sky-500/20",
  },
  {
    key: "creator",
    name: "Creator Agent",
    emoji: "✍️",
    task: "Writing post captions",
    description: "Writes captions, threads and post copy in your brand voice.",
    greeting:
      "Hey! I'm your Creator Agent. I write captions, hooks, threads and carousels that sound like your brand.\n\nWhat should we create today?",
    tone: "bg-pink-100 dark:bg-pink-500/20",
  },
  {
    key: "scheduler",
    name: "Scheduler Agent",
    emoji: "📅",
    task: "Planning the posting calendar",
    description: "Plans your content calendar and picks the best times to post.",
    greeting:
      "Hello! I'm your Scheduler Agent. I plan your posting calendar and find the best times to reach your audience.\n\nWhat would you like me to schedule?",
    tone: "bg-amber-100 dark:bg-amber-500/20",
  },
  {
    key: "analytics",
    name: "Analytics Agent",
    emoji: "📊",
    task: "Tracking engagement",
    description: "Tracks reach and engagement and tells you what's working.",
    greeting:
      "Hi there! I'm your Analytics Agent. I track reach, engagement and growth, and turn the numbers into clear next steps.\n\nWhat would you like to analyze?",
    tone: "bg-emerald-100 dark:bg-emerald-500/20",
  },
]

export function roleForSeat(index: number) {
  return AGENT_ROLES[index % AGENT_ROLES.length]
}
