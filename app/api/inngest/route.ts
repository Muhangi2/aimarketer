import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { functions } from "@/lib/inngest/functions"

// Inngest calls this route to run the agent task functions (locally: npm run inngest:dev)
export const { GET, POST, PUT } = serve({ client: inngest, functions })

// Agent runs can take a few minutes on a local model
export const maxDuration = 300
