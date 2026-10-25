"use client"

import { useEffect, useState } from "react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"

type Settings = {
  tone: string
  language: string
  approveBeforePublishing: boolean
  dailySummary: boolean
  instructions: string
}

const DEFAULTS: Settings = {
  tone: "friendly",
  language: "en",
  approveBeforePublishing: true,
  dailySummary: false,
  instructions: "",
}

// Saved in this browser only until agent settings get a database table
function load(key: string): Settings {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export function AgentSettings({ storageKey, agentName }: { storageKey: string; agentName: string }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSettings(load(storageKey))
    setSaved(false)
  }, [storageKey])

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: value }))
    setSaved(false)
  }

  function save() {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(settings))
      setSaved(true)
    } catch {
      setSaved(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="flex flex-col gap-5 py-4 animate-in fade-in duration-300"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-tone">Tone of voice</Label>
          <NativeSelect id="agent-tone" className="w-full" value={settings.tone} onChange={(e) => update("tone", e.target.value)}>
            <NativeSelectOption value="friendly">Friendly</NativeSelectOption>
            <NativeSelectOption value="professional">Professional</NativeSelectOption>
            <NativeSelectOption value="playful">Playful</NativeSelectOption>
            <NativeSelectOption value="bold">Bold</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="agent-language">Language</Label>
          <NativeSelect id="agent-language" className="w-full" value={settings.language} onChange={(e) => update("language", e.target.value)}>
            <NativeSelectOption value="en">English</NativeSelectOption>
            <NativeSelectOption value="es">Spanish</NativeSelectOption>
            <NativeSelectOption value="fr">French</NativeSelectOption>
            <NativeSelectOption value="sw">Swahili</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

      <div className="divide-y rounded-xl border">
        {(
          [
            ["approveBeforePublishing", "Ask before publishing", "Review everything before it goes live."],
            ["dailySummary", "Daily summary", `Get a daily recap of what the ${agentName} did.`],
          ] as const
        ).map(([key, label, hint]) => (
          <label key={key} className="flex cursor-pointer items-center justify-between gap-4 p-4">
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
            <Switch checked={settings[key]} onCheckedChange={(v) => update(key, v)} />
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="agent-instructions">Custom instructions</Label>
        <textarea
          id="agent-instructions"
          rows={3}
          value={settings.instructions}
          onChange={(e) => update("instructions", e.target.value)}
          placeholder="e.g. Always mention our free trial. Avoid slang."
          className="resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 animate-in fade-in dark:text-emerald-400">
            <Check className="size-3.5" /> Saved
          </span>
        )}
        <Button type="submit" className="h-9 px-4">
          Save settings
        </Button>
      </div>
    </form>
  )
}
