import Link from "next/link"
import { ArrowLeft, Check } from "lucide-react"
import { Brand } from "@/components/brand"
import { FeedWall } from "@/components/landing/feed-wall"
import { LivePost } from "@/components/landing/live-post"

const POINTS = [
  "Five AI agents that research, write, publish and learn",
  "One dashboard for all 13 social platforms",
  "Nothing goes live without your approval",
]

// Same look as the landing page: form on off-white, the live feed framed on the right
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh bg-paper text-ink lg:h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:overflow-hidden">
      <div className="flex min-h-svh flex-col px-6 py-6 sm:px-10 lg:min-h-0">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Hively home">
            <Brand />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            Back to home
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>

        <p className="text-xs text-slate-400">© {new Date().getFullYear()} Hively</p>
      </div>

      <div className="relative hidden p-3 lg:block">
        <div className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-black/[0.06] bg-night">
          <div className="relative z-10 p-10 pb-6">
            <h2 className="max-w-md text-4xl leading-[1.05] font-medium tracking-[-0.04em]">
              Your social media team, <span className="text-brand">ready when you are.</span>
            </h2>
            <ul className="mt-6 space-y-2.5">
              {POINTS.map((point) => (
                <li key={point} className="flex items-center gap-2.5 text-[15px] text-slate-600">
                  <span className="flex size-5 items-center justify-center rounded-full bg-brand text-white">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative min-h-0 flex-1">
            <FeedWall
              tilted={false}
              columns={3}
              className="[mask-image:linear-gradient(to_bottom,transparent,black_15%,black_85%,transparent)]"
            />
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <LivePost />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
