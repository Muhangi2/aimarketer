"use client"

import { useEffect, useState } from "react"
import {
  AlertCircle,
  Crop,
  Eraser,
  Expand,
  ImageUpscale,
  Layers,
  Paintbrush,
  RectangleHorizontal,
  ScanFace,
  Shapes,
  Sparkles,
  SunMedium,
  Type,
  Undo2,
  Wand2,
  type LucideIcon,
} from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import {
  EDIT_CATALOG,
  IMAGE_EDIT_OPERATIONS,
  PLATFORM_PRESETS,
  PLATFORM_SIZES,
  PRESET_LABELS,
  TEXT_POSITIONS,
  type ImageEditOperation,
  type PlatformPreset,
  type TextPosition,
} from "@/lib/imagekit/edits"
import { editPostImage } from "@/lib/posts/client"
import type { PostMedia } from "@/lib/posts/types"

const OP_ICONS: Record<ImageEditOperation, LucideIcon> = {
  remove_background: Eraser,
  change_background: Paintbrush,
  edit: Wand2,
  generate_variation: Shapes,
  retouch: SunMedium,
  upscale: ImageUpscale,
  drop_shadow: Layers,
  extend: Expand,
  smart_crop: Crop,
  face_crop: ScanFace,
  platform_size: RectangleHorizontal,
  add_text: Type,
}

type Version = { url: string; operation: ImageEditOperation | null }

// The editor checks once per page load whether ImageKit is set up
let availability: Promise<boolean> | null = null
function imageKitAvailable() {
  availability ??= fetch("/api/posts/media/edit")
    .then((r) => r.json())
    .then((b: { available?: boolean }) => Boolean(b.available))
    .catch(() => true)
  return availability
}

export function ImageEditorDialog({
  open,
  onOpenChange,
  campaignId,
  media,
  defaultPreset,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  campaignId: string
  media: PostMedia | null
  defaultPreset: PlatformPreset
  onSave: (media: PostMedia) => void
}) {
  const [versions, setVersions] = useState<Version[]>([])
  const [index, setIndex] = useState(0)
  const [operation, setOperation] = useState<ImageEditOperation>("remove_background")
  const [prompt, setPrompt] = useState("")
  const [text, setText] = useState("")
  const [position, setPosition] = useState<TextPosition>("bottom")
  const [preset, setPreset] = useState<PlatformPreset>(defaultPreset)
  const [width, setWidth] = useState(1080)
  const [height, setHeight] = useState(1350)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [available, setAvailable] = useState(true)

  // Fresh history each time the dialog opens on an image
  useEffect(() => {
    if (!open || !media) return
    setVersions([{ url: media.url, operation: null }])
    setIndex(0)
    setError(null)
    setPreset(defaultPreset)
    imageKitAvailable().then(setAvailable)
  }, [open, media, defaultPreset])

  const current = versions[index]
  const info = EDIT_CATALOG[operation]
  const needs = new Set(info.params)

  async function apply() {
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      const result = await editPostImage(campaignId, current.url, {
        operation,
        prompt: needs.has("prompt") ? prompt : null,
        text: needs.has("text") ? text : null,
        position: needs.has("text") ? position : null,
        preset: needs.has("preset") ? preset : null,
        width: needs.has("size") ? width : null,
        height: needs.has("size") ? height : null,
      })
      // A new edit drops any versions after the one being edited
      setVersions((v) => [...v.slice(0, index + 1), { url: result.url, operation }])
      setIndex(index + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The edit didn't work.")
    } finally {
      setBusy(false)
    }
  }

  function save() {
    if (!media || !current) return
    const applied = versions.slice(1, index + 1).flatMap((v) => (v.operation ? [v.operation] : []))
    onSave({ ...media, url: current.url, originalUrl: media.originalUrl ?? media.url, edits: [...media.edits, ...applied] })
    onOpenChange(false)
  }

  const missing =
    (needs.has("prompt") && !info.optionalPrompt && !prompt.trim()) || (needs.has("text") && !text.trim()) || (needs.has("size") && (!width || !height))

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-violet-500/12 text-violet-600 dark:text-violet-400">
              <Sparkles className="size-4" />
            </span>
            Edit image
          </DialogTitle>
          <DialogDescription>ImageKit AI transformations. Each edit is saved as a new version you can undo.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-0 lg:grid-cols-[1fr_22rem]">
          {/* Preview and version history */}
          <div className="flex min-w-0 flex-col gap-3 bg-muted/40 p-5">
            <div className="relative flex min-h-72 flex-1 items-center justify-center overflow-hidden rounded-xl border bg-[conic-gradient(var(--color-muted)_25%,transparent_0_50%,var(--color-muted)_0_75%,transparent_0)] bg-size-[20px_20px]">
              {current && (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={current.url} src={current.url} alt="Image being edited" className="max-h-[52svh] w-auto object-contain animate-in fade-in duration-300" />
              )}
              {busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm animate-in fade-in">
                  <Spinner className="size-6 text-violet-600" />
                  <p className="text-sm font-medium">Applying {info.label.toLowerCase()}…</p>
                  <p className="max-w-xs text-center text-xs text-muted-foreground">AI edits can take up to a minute the first time.</p>
                </div>
              )}
            </div>
            {versions.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {versions.map((v, i) => (
                  <button
                    key={v.url}
                    type="button"
                    onClick={() => setIndex(i)}
                    disabled={busy}
                    title={v.operation ? EDIT_CATALOG[v.operation].label : "Original"}
                    className={cn(
                      "relative size-14 shrink-0 overflow-hidden rounded-lg border-2 bg-background transition-all",
                      i === index ? "border-violet-500 ring-3 ring-violet-500/20" : "border-transparent opacity-70 hover:opacity-100"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.url} alt="" className="size-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 text-[9px] text-white">
                      {v.operation ? EDIT_CATALOG[v.operation].label : "Original"}
                    </span>
                  </button>
                ))}
                <Button variant="ghost" size="sm" className="ml-auto shrink-0" disabled={busy || index === 0} onClick={() => setIndex(index - 1)}>
                  <Undo2 data-icon="inline-start" /> Undo
                </Button>
              </div>
            )}
          </div>

          {/* Operations and their settings */}
          <div className="flex flex-col gap-4 border-t p-5 lg:border-t-0 lg:border-l">
            {!available && (
              <p className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="mt-px size-4 shrink-0" />
                Image editing needs ImageKit. Add IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT to your environment.
              </p>
            )}
            {(["ai", "layout"] as const).map((group) => (
              <div key={group}>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group === "ai" ? "AI magic" : "Size & text"}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {IMAGE_EDIT_OPERATIONS.filter((op) => EDIT_CATALOG[op].group === group).map((op) => {
                    const Icon = OP_ICONS[op]
                    return (
                      <button
                        key={op}
                        type="button"
                        disabled={busy}
                        onClick={() => setOperation(op)}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-medium transition-all hover:bg-muted",
                          operation === op && "border-violet-500/50 bg-violet-500/8 text-violet-700 ring-3 ring-violet-500/10 dark:text-violet-300"
                        )}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        <span className="truncate">{EDIT_CATALOG[op].label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">{info.description}</p>
              {needs.has("prompt") && (
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-prompt">Prompt{info.optionalPrompt ? " (optional)" : ""}</Label>
                  <Input id="edit-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={info.placeholder} maxLength={300} />
                </div>
              )}
              {needs.has("text") && (
                <>
                  <div className="grid gap-1.5">
                    <Label htmlFor="edit-text">Text</Label>
                    <Input id="edit-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={info.placeholder} maxLength={200} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="edit-position">Position</Label>
                    <NativeSelect id="edit-position" value={position} onChange={(e) => setPosition(e.target.value as TextPosition)} className="w-full">
                      {TEXT_POSITIONS.map((p) => (
                        <NativeSelectOption key={p} value={p}>
                          {p[0].toUpperCase() + p.slice(1)}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </div>
                </>
              )}
              {needs.has("preset") && (
                <div className="grid gap-1.5">
                  <Label htmlFor="edit-preset">Platform size</Label>
                  <NativeSelect id="edit-preset" value={preset} onChange={(e) => setPreset(e.target.value as PlatformPreset)} className="w-full">
                    {PLATFORM_PRESETS.map((p) => (
                      <NativeSelectOption key={p} value={p}>
                        {PRESET_LABELS[p]} · {PLATFORM_SIZES[p].width}×{PLATFORM_SIZES[p].height}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              )}
              {needs.has("size") && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="edit-width">Width</Label>
                    <Input id="edit-width" type="number" min={16} max={4000} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="edit-height">Height</Label>
                    <Input id="edit-height" type="number" min={16} max={4000} value={height} onChange={(e) => setHeight(Number(e.target.value))} />
                  </div>
                </div>
              )}
              <Button onClick={apply} disabled={busy || !available || missing || !current} className="bg-violet-600 text-white hover:bg-violet-600/90">
                {busy ? <Spinner data-icon="inline-start" /> : <Wand2 data-icon="inline-start" />}
                Apply {info.label.toLowerCase()}
              </Button>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 px-5 py-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || index === 0}>
            Save image
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
