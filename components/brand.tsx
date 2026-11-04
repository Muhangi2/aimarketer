import { Sparkles } from "lucide-react"
import { cn } from "cn"

export function Brand({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-lg shadow-sm",
          inverted ? "bg-white text-primary" : "bg-primary text-primary-foreground shadow-primary/30"
        )}
      >
        <Sparkles className="size-4" />
      </span>
      <span className="text-[15px]">Hively</span>
    </span>
  )
}
