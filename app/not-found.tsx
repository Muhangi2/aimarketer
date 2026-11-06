import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Brand } from "@/components/brand"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col bg-background px-6 py-6 text-foreground">
      <Link href="/" aria-label="Hively home" className="self-start">
        <Brand />
      </Link>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="font-mono text-xs tracking-[0.14em] text-brand uppercase">Error 404</p>
        <h1 className="mt-4 text-4xl font-medium tracking-[-0.04em] sm:text-5xl">This page doesn&apos;t exist.</h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          The link may be broken, or the page may have moved. Let&apos;s get you back on track.
        </p>
        <div className="mt-8 flex gap-2">
          <Button variant="outline" size="lg" nativeButton={false} render={<Link href="/" />}>
            <ArrowLeft /> Home
          </Button>
          <Button size="lg" nativeButton={false} render={<Link href="/dashboard" />}>
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
