/**
 * Admin-triggered full-window debug snaps via the Wine-host preview agent.
 * Requires Preview agent URL (set in Admin → Studio; started by ./studio up).
 */

import {
  getEffectivePortraitPreviewUrl,
  getEffectivePortraitWorkerToken,
} from "@/lib/studio-settings-store"
import {
  saveStudioDebugScreenshot,
  type StudioDebugScreenshotMeta,
} from "@/lib/studio-debug-screenshots"

const CAPTURE_TIMEOUT_MS = Number(
  process.env.PORTRAIT_DEBUG_SNAP_TIMEOUT_MS || 45000
)

export class DebugSnapError extends Error {
  status: number
  constructor(message: string, status = 502) {
    super(message)
    this.name = "DebugSnapError"
    this.status = status
  }
}

function normalizeRole(raw: string): string | null {
  const m = raw.trim().toLowerCase()
  if (m === "vam") return "vam1"
  if (m === "vaf") return "vaf1"
  if (m === "vam1" || m === "vaf1") return m
  return null
}

export async function requestRemoteDebugScreenshot(input: {
  role: string
  step?: string
}): Promise<StudioDebugScreenshotMeta> {
  const role = normalizeRole(input.role)
  if (!role) {
    throw new DebugSnapError("role must be vam1 or vaf1", 400)
  }

  const baseUrl = getEffectivePortraitPreviewUrl().replace(/\/$/, "")
  if (!baseUrl) {
    throw new DebugSnapError(
      "Preview agent URL not set (Admin → Studio). " +
        "On the Wine host: ./studio up (starts the agent on :14701).",
      400
    )
  }
  const token = getEffectivePortraitWorkerToken()
  if (!token) {
    throw new DebugSnapError(
      "Worker/studio token missing (Admin → Studio)",
      500
    )
  }

  const step = (input.step || "admin").trim() || "admin"
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), CAPTURE_TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/debug-snap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Portrait-Worker-Token": token,
      },
      body: JSON.stringify({ mannequin: role, step }),
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
      throw new DebugSnapError(`Wine host debug-snap failed: ${detail}`, 502)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 32) {
      throw new DebugSnapError("Wine host returned empty image", 502)
    }
    return saveStudioDebugScreenshot({ role, step, bytes: buf })
  } catch (e) {
    if (e instanceof DebugSnapError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    throw new DebugSnapError(
      `Preview agent unreachable (${baseUrl}): ${msg}. ` +
        `On the Wine host run ./studio up (or ./studio preview-server).`,
      502
    )
  } finally {
    clearTimeout(timer)
  }
}
