"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Image from "next/image"
import { ArrowLeft, ArrowRight, Check, ImagePlus, Lightbulb, X } from "lucide-react"
import { cn } from "cn"
import { createBrowserClient } from "@insforge/sdk/ssr"
import { createCampaign } from "@/app/actions/campaign"
import { CAMPAIGN_ICON_BUCKET, MAX_ICON_BYTES } from "@/lib/campaign"
import type { Office } from "@/lib/offices"
import { CampaignIcon, PRESET_ICONS } from "@/components/campaign/campaign-icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"

type IconChoice = { type: "preset"; id: string } | { type: "custom"; file: File; preview: string }

const STEPS = [
  {
    title: "Campaign details",
    hint: "Name and icon",
    heading: "Create your first campaign",
    description: "Give your campaign a name and an icon so you can recognise it at a glance.",
  },
  {
    title: "AI agent office",
    hint: "Where your agents work",
    heading: "Choose your AI agent office",
    description: "Pick the workspace where your AI marketing agents will plan and create content.",
  },
] as const

export function CreateCampaignWizard({
  userId,
  offices,
  isFirst = true,
}: {
  userId: string
  offices: Office[]
  isFirst?: boolean
}) {
  const [step, setStep] = useState<0 | 1>(0)
  const [name, setName] = useState("")
  const [icon, setIcon] = useState<IconChoice | null>(null)
  const [office, setOffice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)

  // Release the object URL of a replaced or discarded custom icon
  useEffect(() => {
    const preview = icon?.type === "custom" ? icon.preview : null
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [icon])

  const trimmedName = name.trim()
  const canContinue = trimmedName.length > 0 && icon !== null
  const selectedOffice = offices.find((o) => o.src === office)

  function handleFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith("image/")) return setError("Upload an image file (PNG, JPG, SVG or WebP).")
    if (file.size > MAX_ICON_BYTES) return setError("Icon must be 2 MB or smaller.")
    setError(null)
    setIcon({ type: "custom", file, preview: URL.createObjectURL(file) })
  }

  function handleCreate() {
    if (!icon || !office) return
    setError(null)

    startTransition(async () => {
      let iconValue: string
      let iconKey: string | undefined

      if (icon.type === "custom") {
        const ext = icon.file.name.split(".").pop()?.toLowerCase() || "png"
        const insforge = createBrowserClient()
        const { data, error: uploadError } = await insforge.storage
          .from(CAMPAIGN_ICON_BUCKET)
          .upload(`${userId}/${crypto.randomUUID()}.${ext}`, icon.file)
        if (uploadError || !data) {
          setError(uploadError?.message ?? "Icon upload failed. Please try again.")
          return
        }
        iconValue = data.url
        iconKey = data.key
      } else {
        iconValue = icon.id
      }

      const result = await createCampaign({
        name: trimmedName,
        iconType: icon.type,
        icon: iconValue,
        iconKey,
        officeImage: office,
      })
      if (result?.error) setError(result.error)
    })
  }

  const current = STEPS[step]

  return (
    <div className="mx-auto grid h-full w-full max-w-6xl gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* Progress and live preview */}
      <aside className="hidden min-h-0 flex-col gap-6 rounded-2xl border bg-card p-6 shadow-sm lg:flex">
        <div>
          <p className="text-xs font-semibold tracking-wider text-primary uppercase">New campaign</p>
          <p className="mt-1 text-sm text-muted-foreground">Two quick steps and your AI team is ready.</p>
        </div>

        <ol className="flex flex-col">
          {STEPS.map((s, i) => {
            const done = i < step
            const active = i === step
            return (
              <li key={s.title} className="relative flex gap-3 pb-6 last:pb-0">
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className={cn("absolute top-9 left-[15px] h-[calc(100%-2.25rem)] w-px", done ? "bg-primary" : "bg-border")}
                  />
                )}
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && "border-primary bg-accent text-primary",
                    !done && !active && "bg-card text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <div className="pt-1">
                  <p className={cn("text-sm font-medium", !active && !done && "text-muted-foreground")}>{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.hint}</p>
                </div>
              </li>
            )
          })}
        </ol>

        <div className="mt-auto flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground">Preview</p>
          <div className="overflow-hidden rounded-xl border bg-background">
            <div className="relative aspect-[16/9] bg-gradient-to-br from-brand-glow to-brand-glow">
              {selectedOffice && (
                <Image src={selectedOffice.src} alt="" fill sizes="300px" className="object-cover" />
              )}
            </div>
            <div className="flex items-center gap-3 p-3">
              {icon ? (
                <CampaignIcon
                  type={icon.type}
                  icon={icon.type === "preset" ? icon.id : icon.preview}
                  className="size-10"
                />
              ) : (
                <span className="size-10 shrink-0 rounded-xl border border-dashed" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{trimmedName || "Untitled campaign"}</p>
                <p className="truncate text-xs text-muted-foreground">{selectedOffice?.label ?? "No office yet"}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Step content */}
      <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
        <header className="border-b px-6 py-5">
          <div className="mb-4 grid grid-cols-2 gap-2 lg:hidden" aria-hidden>
            {STEPS.map((s, i) => (
              <span key={s.title} className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            {step === 0 && !isFirst ? "Create a new campaign" : current.heading}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 lg:overflow-hidden">
          {step === 0 ? (
            <div className="flex max-w-2xl flex-col gap-7">
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="campaign-name">Campaign name</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">{name.length}/80</span>
                </div>
                <Input
                  id="campaign-name"
                  value={name}
                  maxLength={80}
                  autoFocus
                  placeholder="e.g. Summer Product Launch"
                  className="h-11 text-base"
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canContinue) setStep(1)
                  }}
                />
              </div>

              <fieldset className="flex flex-col">
                <legend className="text-sm font-medium">Campaign icon</legend>
                <p className="mt-1 mb-3 text-xs text-muted-foreground">
                  Choose an icon or upload your own (PNG, JPG, SVG or WebP, up to 2 MB).
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {PRESET_ICONS.map((preset) => {
                    const selected = icon?.type === "preset" && icon.id === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        aria-pressed={selected}
                        title={preset.label}
                        onClick={() => {
                          setError(null)
                          setIcon({ type: "preset", id: preset.id })
                        }}
                        className={cn(
                          "flex size-14 items-center justify-center rounded-xl border bg-background transition-all outline-none hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50",
                          selected && "border-primary bg-accent ring-2 ring-primary/25"
                        )}
                      >
                        <CampaignIcon type="preset" icon={preset.id} className="size-10" />
                        <span className="sr-only">{preset.label}</span>
                      </button>
                    )
                  })}

                  <button
                    type="button"
                    aria-pressed={icon?.type === "custom"}
                    onClick={() => fileInput.current?.click()}
                    className={cn(
                      "relative flex size-14 items-center justify-center overflow-hidden rounded-xl border border-dashed border-primary/40 bg-accent/50 text-primary transition-all outline-none hover:-translate-y-0.5 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
                      icon?.type === "custom" && "border-solid border-primary ring-2 ring-primary/25"
                    )}
                  >
                    {icon?.type === "custom" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={icon.preview} alt="Custom icon" className="size-full object-cover" />
                    ) : (
                      <ImagePlus className="size-5" />
                    )}
                    <span className="sr-only">Upload a custom icon</span>
                  </button>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    handleFile(e.target.files?.[0])
                    e.target.value = ""
                  }}
                />
                {icon?.type === "custom" && (
                  <button
                    type="button"
                    className="mt-3 inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                    onClick={() => setIcon(null)}
                  >
                    <X className="size-3" /> Remove uploaded icon
                  </button>
                )}
              </fieldset>

              <div className="flex items-start gap-3 rounded-xl bg-accent/60 p-4 text-sm text-accent-foreground">
                <Lightbulb className="mt-0.5 size-4 shrink-0" />
                <p>Use a clear, goal-based name like &ldquo;Black Friday Sale&rdquo; or &ldquo;Q4 Brand Awareness&rdquo;.</p>
              </div>
            </div>
          ) : (
            <div
              role="radiogroup"
              aria-label="AI agent office"
              className="grid gap-4 sm:grid-cols-2 lg:h-full lg:auto-rows-fr"
            >
              {offices.length === 0 && (
                <p className="text-sm text-muted-foreground">No office images found in public/offices.</p>
              )}
              {offices.map((o) => {
                const selected = office === o.src
                return (
                  <button
                    key={o.src}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setError(null)
                      setOffice(o.src)
                    }}
                    className={cn(
                      "group flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-background text-left transition-all outline-none hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected && "border-primary ring-2 ring-primary/40"
                    )}
                  >
                    <div className="relative aspect-[4/3] min-h-0 bg-muted lg:aspect-auto lg:flex-1">
                      <Image
                        src={o.src}
                        alt={o.label}
                        fill
                        sizes="(min-width: 1024px) 420px, (min-width: 640px) 50vw, 100vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                      <span
                        className={cn(
                          "absolute top-3 right-3 flex size-7 items-center justify-center rounded-full border-2 border-white shadow transition-colors",
                          selected ? "bg-primary text-primary-foreground" : "bg-black/20 text-transparent"
                        )}
                      >
                        <Check className="size-4" />
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center justify-between px-4 py-3">
                      <span className="font-medium">{o.label}</span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium",
                          selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {selected ? "Selected" : "Select"}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t bg-muted/40 px-6 py-4">
          <div className="min-w-0">
            {error ? (
              <p className="truncate text-sm text-destructive">{error}</p>
            ) : step === 1 ? (
              <Button variant="ghost" className="h-10" disabled={pending} onClick={() => setStep(0)}>
                <ArrowLeft /> Back
              </Button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {error && step === 1 && (
              <Button variant="ghost" className="h-10" disabled={pending} onClick={() => setStep(0)}>
                <ArrowLeft /> Back
              </Button>
            )}
            {step === 0 ? (
              <Button className="h-10 px-5 shadow-sm shadow-primary/30" disabled={!canContinue} onClick={() => setStep(1)}>
                Next <ArrowRight />
              </Button>
            ) : (
              <Button
                className="h-10 px-5 shadow-sm shadow-primary/30"
                disabled={!office || pending}
                onClick={handleCreate}
              >
                {pending && <Spinner />}
                Create Campaign
              </Button>
            )}
          </div>
        </footer>
      </section>
    </div>
  )
}
