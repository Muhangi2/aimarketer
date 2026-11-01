import "server-only"
import { CommandExitError, Sandbox, SandboxNotFoundError } from "@e2b/desktop"
import type { ComputerAgentKey } from "@/lib/agent-roles"
import { safeFileName, uploadToImageKit, imageKitConfigured } from "@/lib/computers/imagekit"
import type { ComputerRow, ComputerStore } from "@/lib/computers/store"

/*
 * Cloud Linux desktops (E2B Desktop sandboxes). One per computer agent per campaign: paused when
 * idle, resumed for the next task, and killed for good when the campaign ends.
 */

export const SCREEN = { width: 1024, height: 768 }
// Kept alive this long after the last connect. E2B pauses (never kills) it if we miss the idle pause
const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000
const STREAM_PORT = 6080
export const HOME = "/home/user"
export const FOLDERS = { research: `${HOME}/research`, assets: `${HOME}/assets`, output: `${HOME}/output` } as const
// Files collected from a computer when its campaign ends
const MAX_LEFTOVER_FILES = 40
const MAX_LEFTOVER_BYTES = 25 * 1024 * 1024

export class DesktopError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "DesktopError"
  }
}

function apiKey() {
  const key = process.env.E2B_API_KEY
  if (!key) throw new DesktopError("Agent computers are not set up (E2B_API_KEY).")
  return key
}

export const computersConfigured = () => Boolean(process.env.E2B_API_KEY)

/** Single-quotes a value for the sandbox's shell. */
export function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

export type ShellResult = { exitCode: number; stdout: string; stderr: string }

/** Runs a shell command on the desktop; a non-zero exit is a result, not an error. */
export async function runShell(sandbox: Sandbox, command: string, timeoutMs = 60_000): Promise<ShellResult> {
  try {
    const r = await sandbox.commands.run(command, { timeoutMs })
    return { exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
  } catch (error) {
    if (error instanceof CommandExitError) return { exitCode: error.exitCode, stdout: error.stdout, stderr: error.stderr }
    throw error
  }
}

export async function connectDesktop(sandboxId: string) {
  return Sandbox.connect(sandboxId, { apiKey: apiKey(), timeoutMs: SANDBOX_TIMEOUT_MS })
}

// Starts the password-protected stream if it isn't running (e.g. after a cold resume) and saves its key
async function ensureStream(store: ComputerStore, agentKey: ComputerAgentKey, sandbox: Sandbox) {
  const { streamKey } = await store.getSecret(agentKey)
  const vnc = await runShell(sandbox, "pgrep -x x11vnc")
  const web = await runShell(sandbox, `netstat -tuln | grep ":${STREAM_PORT} "`)
  if (streamKey && vnc.exitCode === 0 && web.exitCode === 0) return
  await runShell(sandbox, "pkill x11vnc; pkill -f novnc_proxy; true")
  await sandbox.stream.start({ requireAuth: true })
  await store.setSecret(agentKey, { streamKey: sandbox.stream.getAuthKey() })
}

/**
 * Opens the agent's desktop for work: resumes it if paused, creates it if there isn't one.
 * Leaves the computer row as "running".
 */
export async function openDesktop(store: ComputerStore, agentKey: ComputerAgentKey): Promise<Sandbox> {
  const computer = await store.ensure(agentKey)
  if (computer.status === "shut_down") throw new DesktopError("This campaign's computers have been shut down.")

  if (computer.sandboxId) {
    try {
      if (computer.status === "paused") await store.update(agentKey, { status: "starting", activity: "Resuming its computer" })
      const sandbox = await connectDesktop(computer.sandboxId)
      await ensureStream(store, agentKey, sandbox)
      await store.update(agentKey, { status: "running", lastActiveAt: Date.now(), error: null })
      return sandbox
    } catch (error) {
      // Gone (expired or deleted): start a fresh one below
      if (!(error instanceof SandboxNotFoundError) && !/not found|404/i.test(String(error))) {
        await store.update(agentKey, { status: "error", error: "Couldn't resume the computer." }).catch(() => undefined)
        throw new DesktopError("Couldn't resume the agent's computer.", { cause: error })
      }
    }
  }

  await store.update(agentKey, { status: "starting", activity: "Starting its computer", sandboxId: null })
  let sandbox: Sandbox
  try {
    sandbox = await Sandbox.create({
      apiKey: apiKey(),
      resolution: [SCREEN.width, SCREEN.height],
      timeoutMs: SANDBOX_TIMEOUT_MS,
      lifecycle: { onTimeout: "pause", autoResume: false },
      metadata: { campaignId: store.campaignId, agentKey },
    })
  } catch (error) {
    await store.update(agentKey, { status: "error", error: "Couldn't start the computer." }).catch(() => undefined)
    throw new DesktopError("Couldn't start the agent's computer.", { cause: error })
  }
  try {
    await store.update(agentKey, { sandboxId: sandbox.sandboxId })
  } catch (error) {
    // Nothing points at this desktop, so a retry would start another: shut it down instead
    await sandbox.kill().catch(() => undefined)
    throw error
  }
  await runShell(sandbox, `mkdir -p ${Object.values(FOLDERS).join(" ")}`)
  await sandbox.stream.start({ requireAuth: true })
  await store.setSecret(agentKey, { streamKey: sandbox.stream.getAuthKey(), screenshot: null })
  await store.update(agentKey, { status: "running", lastActiveAt: Date.now(), error: null, screenshotAt: null })
  return sandbox
}

/** The noVNC page for a running desktop. Contains the stream password: only for the campaign owner. */
export function streamUrl(sandbox: Sandbox, streamKey: string, viewOnly: boolean) {
  const url = new URL(`https://${sandbox.getHost(STREAM_PORT)}/vnc.html`)
  url.searchParams.set("autoconnect", "true")
  url.searchParams.set("resize", "scale")
  url.searchParams.set("reconnect", "true")
  if (viewOnly) url.searchParams.set("view_only", "true")
  url.searchParams.set("password", streamKey)
  return url.toString()
}

export async function screenshotBase64(sandbox: Sandbox) {
  return Buffer.from(await sandbox.screenshot()).toString("base64")
}

/** Saves a screenshot (so the UI can show it), then pauses the desktop. */
export async function pauseDesktop(store: ComputerStore, computer: ComputerRow) {
  const agentKey = computer.agentKey
  if (!computer.sandboxId) return
  const claimed = await store.transition(agentKey, ["running"], { status: "pausing", activity: "Pausing" })
  if (!claimed) return
  try {
    const info = await Sandbox.getInfo(computer.sandboxId, { apiKey: apiKey() }).catch(() => null)
    if (info && info.state === "running") {
      const sandbox = await connectDesktop(computer.sandboxId)
      const shot = await screenshotBase64(sandbox).catch(() => null)
      if (shot) await store.setSecret(agentKey, { screenshot: shot })
      await sandbox.pause()
      await store.update(agentKey, { status: "paused", activity: null, ...(shot ? { screenshotAt: Date.now() } : {}) })
    } else {
      await store.update(agentKey, { status: info ? "paused" : "none", activity: null, ...(info ? {} : { sandboxId: null }) })
    }
  } catch (error) {
    console.error(`Could not pause the ${agentKey} computer`, error)
    await store.transition(agentKey, ["pausing"], { status: "running" }).catch(() => undefined)
    throw error
  }
}

export type LeftoverFile = { name: string; url: string; size: number; mimeType: string | null }

/** Uploads what's left in the work folders, then shuts the desktop down for good. */
export async function shutDownDesktop(store: ComputerStore, computer: ComputerRow) {
  const agentKey = computer.agentKey
  const uploaded: LeftoverFile[] = []
  if (computer.sandboxId) {
    try {
      const sandbox = await connectDesktop(computer.sandboxId)
      if (imageKitConfigured()) {
        const list = await runShell(sandbox, `find ${Object.values(FOLDERS).join(" ")} -type f -size -${MAX_LEFTOVER_BYTES}c 2>/dev/null | head -n ${MAX_LEFTOVER_FILES}`)
        for (const path of list.stdout.split("\n").map((l) => l.trim()).filter(Boolean)) {
          try {
            const bytes = await sandbox.files.read(path, { format: "bytes" })
            const name = path.split("/").pop() ?? "file"
            const file = await uploadToImageKit(bytes, {
              fileName: safeFileName(name),
              folder: `/campaigns/${store.campaignId}/${agentKey}/final`,
              mimeType: mimeFor(name),
            })
            uploaded.push({ name, url: file.url, size: file.size, mimeType: mimeFor(name) })
          } catch (error) {
            console.error(`Could not upload ${path} from the ${agentKey} computer`, error)
          }
        }
      }
      await sandbox.kill()
    } catch (error) {
      // Already gone: nothing to collect
      console.error(`Could not reach the ${agentKey} computer while shutting it down`, error)
      await Sandbox.kill(computer.sandboxId, { apiKey: apiKey() }).catch(() => undefined)
    }
  }
  await store.update(agentKey, { status: "shut_down", sandboxId: null, control: "agent", activity: null })
  await store.deleteSecret(agentKey)
  return uploaded
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  mp4: "video/mp4",
}

export function mimeFor(name: string) {
  return MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? null
}
