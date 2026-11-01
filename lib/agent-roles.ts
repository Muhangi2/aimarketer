export const AGENT_KEYS = ["research", "creator", "scheduler", "analytics"] as const
export type AgentKey = (typeof AGENT_KEYS)[number]

export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(value)
}

// Agents with their own cloud desktop. Scheduler and Analytics don't get one
export const COMPUTER_AGENT_KEYS = ["research", "creator"] as const
export type ComputerAgentKey = (typeof COMPUTER_AGENT_KEYS)[number]

export function isComputerAgent(value: string): value is ComputerAgentKey {
  return (COMPUTER_AGENT_KEYS as readonly string[]).includes(value)
}

// The Master Agent coordinates the four regular agents
export const MASTER_KEY = "master" as const
export type MasterKey = typeof MASTER_KEY
// Every agent that has its own chat thread
export type ThreadKey = MasterKey | AgentKey
export const THREAD_KEYS: readonly ThreadKey[] = [MASTER_KEY, ...AGENT_KEYS]

export function isThreadKey(value: string): value is ThreadKey {
  return (THREAD_KEYS as readonly string[]).includes(value)
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
      "Hi! I'm your Research Agent. I find trending topics, analyze competitors and suggest content ideas. The Master Agent assigns my tasks, and you can ask me anything about my work here.",
    tone: "bg-sky-100 dark:bg-sky-500/20",
  },
  {
    key: "creator",
    name: "Creator Agent",
    emoji: "✍️",
    task: "Writing post captions",
    description: "Writes captions, threads and post copy in your brand voice.",
    greeting:
      "Hey! I'm your Creator Agent. I write captions, hooks, threads and carousels that sound like your brand. The Master Agent assigns my tasks, and you can ask me anything about my work here.",
    tone: "bg-pink-100 dark:bg-pink-500/20",
  },
  {
    key: "scheduler",
    name: "Scheduler Agent",
    emoji: "📅",
    task: "Planning the posting calendar",
    description: "Plans your content calendar and picks the best times to post.",
    greeting:
      "Hello! I'm your Scheduler Agent. I plan your posting calendar and find the best times to reach your audience. The Master Agent assigns my tasks, and you can ask me anything about my work here.",
    tone: "bg-amber-100 dark:bg-amber-500/20",
  },
  {
    key: "analytics",
    name: "Analytics Agent",
    emoji: "📊",
    task: "Tracking engagement",
    description: "Tracks reach and engagement and tells you what's working.",
    greeting:
      "Hi there! I'm your Analytics Agent. I track reach, engagement and growth, and turn the numbers into clear next steps. The Master Agent assigns my tasks, and you can ask me anything about my work here.",
    tone: "bg-emerald-100 dark:bg-emerald-500/20",
  },
]

export function roleForSeat(index: number) {
  return AGENT_ROLES[index % AGENT_ROLES.length]
}

export const MASTER_ROLE = {
  key: MASTER_KEY,
  name: "Master Agent",
  emoji: "🧠",
  task: "Coordinating the team",
  description: "Plans your requests, assigns work to the team and reviews every result.",
  greeting:
    "Hi! I'm your Master Agent. Tell me what you want to achieve and I'll plan it, assign the work to the Research, Creator, Scheduler and Analytics agents, and check their results.\n\nWhat should the team work on?",
} as const

// Display name for any participant in a conversation
export function participantName(key: ThreadKey | "user") {
  if (key === "user") return "You"
  if (key === MASTER_KEY) return MASTER_ROLE.name
  return AGENT_ROLES.find((r) => r.key === key)?.name ?? key
}
