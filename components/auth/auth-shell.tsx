import Image from "next/image"
import { CalendarClock, LineChart, Wand2 } from "lucide-react"
import { Brand } from "@/components/brand"

const FEATURES = [
  { Icon: Wand2, text: "AI agents write and design posts in your brand voice" },
  { Icon: CalendarClock, text: "Schedule campaigns across every channel" },
  { Icon: LineChart, text: "Track what works and grow faster" },
]

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-svh overflow-hidden bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-h-0 flex-col px-6 py-6 sm:px-10">
        <Brand />
        <div className="flex flex-1 items-center justify-center py-6">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} AI Marketer</p>
      </div>

      <div className="relative hidden p-3 lg:block">
        <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-10 text-white">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-white/10 blur-3xl"
          />
          <div className="relative max-w-md">
            <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
              Your AI marketing team
            </span>
            <h2 className="mt-4 text-3xl leading-tight font-semibold tracking-tight xl:text-4xl">
              Launch campaigns that grow while you sleep.
            </h2>
            <ul className="mt-6 flex flex-col gap-3">
              {FEATURES.map(({ Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-sm text-blue-50">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                    <Icon className="size-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mt-8 min-h-0 flex-1">
            <div className="absolute inset-x-0 bottom-0 top-0 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/20">
              <Image
                src="/offices/office-blue.png"
                alt="AI agent office"
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 0px"
                className="object-cover object-top"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
