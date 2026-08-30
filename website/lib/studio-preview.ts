/**
 * Admin mannequin preview shots — spawn portrait-worker on the studio host.
 * Website must share DISPLAY / windows.json with the Wine clients.
 */

import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ALLOWED = new Set(["vam1", "vaf1", "vam", "vaf"])
const COOLDOWN_MS = Number(process.env.PORTRAIT_PREVIEW_COOLDOWN_MS || 8000)
const CAPTURE_TIMEOUT_MS = Number(
  process.env.PORTRAIT_PREVIEW_TIMEOUT_MS || 45000
)

const lastCaptureAt = new Map<string, number>()

function websiteRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
}

export function previewCapturesDir(): string {
  const custom = process.env.PORTRAIT_PREVIEW_DIR?.trim()
  if (custom) return path.resolve(custom)
  return path.resolve(websiteRoot(), "../work/portrait-captures")
}

export function normalizePreviewMannequin(raw: string): string | null {
  const m = raw.trim().toLowerCase()
  if (!ALLOWED.has(m)) return null
  if (m === "vam") return "vam1"
  if (m === "vaf") return "vaf1"
  return m
}

export function previewImagePath(mannequin: string): string {
  return path.join(previewCapturesDir(), `preview-${mannequin}.png`)
}

export function previewMetaPath(mannequin: string): string {
  return path.join(previewCapturesDir(), `preview-${mannequin}.json`)
}

export type PreviewMeta = {
  mannequin: string
  ts?: number
  iso?: string
  path?: string
  wid?: string
}

export function readPreviewMeta(mannequin: string): PreviewMeta | null {
  const p = previewMetaPath(mannequin)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as PreviewMeta
  } catch {
    return null
  }
}

function workerScript(): string {
  return path.resolve(
    websiteRoot(),
    "../scripts/portrait/portrait-worker.py"
  )
}

export async function captureStudioPreview(
  mannequinRaw: string
): Promise<{
  mannequin: string
  iso?: string
  ts?: number
  cooldownMs: number
}> {
  const mannequin = normalizePreviewMannequin(mannequinRaw)
  if (!mannequin) {
    throw new PreviewError("mannequin must be vam1 or vaf1", 400)
  }

  const now = Date.now()
  const last = lastCaptureAt.get(mannequin) ?? 0
  const wait = COOLDOWN_MS - (now - last)
  if (wait > 0) {
    throw new PreviewError(
      `cooldown: wait ${Math.ceil(wait / 1000)}s before another ${mannequin} preview`,
      429
    )
  }

  const outDir = previewCapturesDir()
  fs.mkdirSync(outDir, { recursive: true })

  const script = workerScript()
  if (!fs.existsSync(script)) {
    throw new PreviewError(`portrait-worker missing at ${script}`, 500)
  }

  const args = [
    script,
    "preview",
    mannequin,
    "--out",
    outDir,
  ]

  const { code, stdout, stderr } = await runPython(args, CAPTURE_TIMEOUT_MS)
  if (code !== 0) {
    const detail = (stderr || stdout || `exit ${code}`).trim().slice(0, 400)
    throw new PreviewError(`preview capture failed: ${detail}`, 502)
  }

  const img = previewImagePath(mannequin)
  if (!fs.existsSync(img)) {
    throw new PreviewError("preview PNG was not written", 502)
  }

  lastCaptureAt.set(mannequin, Date.now())
  const meta = readPreviewMeta(mannequin)
  return {
    mannequin,
    iso: meta?.iso,
    ts: meta?.ts,
    cooldownMs: COOLDOWN_MS,
  }
}

function runPython(
  args: string[],
  timeoutMs: number
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("python3", args, {
      cwd: websiteRoot(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      stderr += "\n(timeout)"
    }, timeoutMs)
    child.stdout.on("data", (buf: Buffer) => {
      stdout += buf.toString("utf8")
    })
    child.stderr.on("data", (buf: Buffer) => {
      stderr += buf.toString("utf8")
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ code: 1, stdout, stderr: err.message })
    })
  })
}

export class PreviewError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = "PreviewError"
    this.status = status
  }
}
