/**
 * Admin mannequin preview shots.
 *
 * Split deploy: set PORTRAIT_PREVIEW_URL to the homelab agent
 * (portrait-preview-agent.py) that shares DISPLAY with Wine clients.
 * Same-host/dev: omit it and spawn portrait-worker locally.
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

function previewAgentUrl(): string {
  return (process.env.PORTRAIT_PREVIEW_URL || "").trim().replace(/\/$/, "")
}

function workerToken(): string {
  return (
    process.env.PORTRAIT_WORKER_TOKEN?.trim() ||
    process.env.PORTRAIT_STUDIO_TOKEN?.trim() ||
    ""
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

  const remote = previewAgentUrl()
  if (remote) {
    await captureViaAgent(remote, mannequin, outDir)
  } else {
    await captureLocal(mannequin, outDir)
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

async function captureViaAgent(
  baseUrl: string,
  mannequin: string,
  outDir: string
): Promise<void> {
  const token = workerToken()
  if (!token) {
    throw new PreviewError(
      "PORTRAIT_PREVIEW_URL set but PORTRAIT_WORKER_TOKEN / PORTRAIT_STUDIO_TOKEN missing",
      500
    )
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CAPTURE_TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/preview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Portrait-Worker-Token": token,
      },
      body: JSON.stringify({ mannequin }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const j = (await res.json()) as { error?: string }
        if (j.error) detail = j.error
      } catch {
        detail = (await res.text()).slice(0, 400) || detail
      }
      throw new PreviewError(`preview agent failed: ${detail}`, 502)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 32) {
      throw new PreviewError("preview agent returned empty image", 502)
    }
    const img = path.join(outDir, `preview-${mannequin}.png`)
    fs.writeFileSync(img, buf)
    const metaHdr = res.headers.get("X-Portrait-Preview-Meta")
    let meta: PreviewMeta = {
      mannequin,
      ts: Date.now() / 1000,
      iso: new Date().toISOString(),
      path: img,
    }
    if (metaHdr) {
      try {
        meta = { ...meta, ...(JSON.parse(metaHdr) as PreviewMeta) }
      } catch {
        /* keep defaults */
      }
    }
    fs.writeFileSync(
      path.join(outDir, `preview-${mannequin}.json`),
      JSON.stringify(meta, null, 2) + "\n"
    )
  } catch (e) {
    if (e instanceof PreviewError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw new PreviewError(
      `preview agent unreachable (${baseUrl}): ${msg}. ` +
        `On the Wine host run: ./portrait-cli preview-server`,
      502
    )
  } finally {
    clearTimeout(timer)
  }
}

async function captureLocal(mannequin: string, outDir: string): Promise<void> {
  const script = workerScript()
  if (!fs.existsSync(script)) {
    throw new PreviewError(
      `portrait-worker missing at ${script}. ` +
        `For split deploy set PORTRAIT_PREVIEW_URL to the homelab agent.`,
      500
    )
  }
  const args = [script, "preview", mannequin, "--out", outDir]
  const { code, stdout, stderr } = await runPython(args, CAPTURE_TIMEOUT_MS)
  if (code !== 0) {
    const detail = (stderr || stdout || `exit ${code}`).trim().slice(0, 400)
    throw new PreviewError(
      `preview capture failed: ${detail}. ` +
        `Wine clients are on another host? Set PORTRAIT_PREVIEW_URL.`,
      502
    )
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
