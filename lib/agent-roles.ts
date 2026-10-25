export type AgentRole = {
  name: string
  emoji: string
  task: string
  // Tint for the emoji chip
  tone: string
}

// Assigned to office seats in order; scenes with more seats than roles wrap around
export const AGENT_ROLES: AgentRole[] = [
  { name: "Research Agent", emoji: "🔍", task: "Finding trending topics", tone: "bg-sky-100 dark:bg-sky-500/20" },
  { name: "Creator Agent", emoji: "✍️", task: "Writing post captions", tone: "bg-pink-100 dark:bg-pink-500/20" },
  { name: "Scheduler Agent", emoji: "📅", task: "Planning the posting calendar", tone: "bg-amber-100 dark:bg-amber-500/20" },
  { name: "Analytics Agent", emoji: "📊", task: "Tracking engagement", tone: "bg-emerald-100 dark:bg-emerald-500/20" },
  { name: "Designer Agent", emoji: "🎨", task: "Designing post visuals", tone: "bg-violet-100 dark:bg-violet-500/20" },
  { name: "Engagement Agent", emoji: "💬", task: "Replying to comments", tone: "bg-blue-100 dark:bg-blue-500/20" },
]

export function roleForSeat(index: number) {
  return AGENT_ROLES[index % AGENT_ROLES.length]
}
