/**
 * Debug screenshots from Wine-host orch/login (vam1/vaf1 window snaps).
 */

import fs from "node:fs"
import path from "node:path"

import { websiteDataDir } from "@/lib/site-settings-store"

const MAX_KEEP = 20
const ALLOWED_ROLES = new Set(["vam1", "vaf1", "vam", "vaf"])

export type StudioDebugScreenshotMeta = {
  id: string
  role: string
  step: string
  filename: string
  createdAt: number
  bytes: number
}

function debugDir(): string {
  const dir = path.join(websiteDataDir(), "studio-debug")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function normalizeRole(raw: string): string | null {
  const r = raw.trim().toLowerCase()
  if (!ALLOWED_ROLES.has(r)) return null
  if (r === "vam") return "vam1"
  if (r === "vaf") return "vaf1"
  return r
}

function safeStep(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return s || "snap"
}

function parseMetaFromName(filename: string): StudioDebugScreenshotMeta | null {
  // {ts}-{role}-{step}.png
  const m = /^(\d+)-(vam1|vaf1)-([a-z0-9_-]+)\.png$/i.exec(filename)
  if (!m) return null
  const createdAt = Number(m[1])
  if (!Number.isFinite(createdAt)) return null
  const full = path.join(debugDir(), filename)
  let bytes = 0
  try {
    bytes = fs.statSync(full).size
  } catch {
    return null
  }
  return {
    id: filename,
    role: m[2].toLowerCase(),
    step: m[3],
    filename,
    createdAt,
    bytes,
  }
}

export function listStudioDebugScreenshots(): StudioDebugScreenshotMeta[] {
  const dir = debugDir()
  const names = fs.readdirSync(dir).filter((n) => n.endsWith(".png"))
  const rows: StudioDebugScreenshotMeta[] = []
  for (const name of names) {
    const meta = parseMetaFromName(name)
    if (meta) rows.push(meta)
  }
  rows.sort((a, b) => b.createdAt - a.createdAt)
  return rows
}

function pruneOld(): void {
  const rows = listStudioDebugScreenshots()
  for (const row of rows.slice(MAX_KEEP)) {
    try {
      fs.unlinkSync(path.join(debugDir(), row.filename))
    } catch {
      /* ignore */
    }
  }
}

export function saveStudioDebugScreenshot(input: {
  role: string
  step: string
  bytes: Buffer
}): StudioDebugScreenshotMeta {
  const role = normalizeRole(input.role)
  if (!role) throw new Error("role must be vam1 or vaf1")
  if (!input.bytes.length) throw new Error("empty image")
  // basic PNG magic
  if (
    input.bytes.length < 8 ||
    input.bytes[0] !== 0x89 ||
    input.bytes[1] !== 0x50
  ) {
    throw new Error("file must be a PNG")
  }
  const step = safeStep(input.step)
  const createdAt = Date.now()
  const filename = `${createdAt}-${role}-${step}.png`
  const dest = path.join(debugDir(), filename)
  fs.writeFileSync(dest, input.bytes)
  pruneOld()
  return {
    id: filename,
    role,
    step,
    filename,
    createdAt,
    bytes: input.bytes.length,
  }
}

export function resolveStudioDebugScreenshotPath(
  id: string
): string | null {
  const base = path.basename(id)
  if (base !== id || !base.endsWith(".png")) return null
  if (!parseMetaFromName(base)) return null
  const full = path.join(debugDir(), base)
  if (!fs.existsSync(full)) return null
  return full
}
