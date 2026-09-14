import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(LIB_DIR, "../..")

function runtimeDir(): string {
  if (process.env.OPS_RUNTIME?.trim()) {
    return path.resolve(process.env.OPS_RUNTIME.trim())
  }
  return path.resolve(REPO_ROOT, "../comp_hack/runtime")
}

export function opsFreshnessPath(): string {
  return path.join(runtimeDir(), "releases", "ops-freshness.json")
}

export type OpsFreshnessData = {
  lastContentChangeAt?: unknown
  lastChannelRestartAt?: unknown
}

/**
 * True when BinaryData / maps / packages were ingested after the last
 * channel restart (same rule as ops/freshness.py is_channel_stale).
 */
export function isChannelContentStale(data: OpsFreshnessData): boolean {
  const change = data.lastContentChangeAt
  if (typeof change !== "string" || !change) return false
  const restart = data.lastChannelRestartAt
  if (typeof restart !== "string" || !restart) return true
  return change > restart
}

export async function isGameFilesRestartPending(): Promise<boolean> {
  try {
    const raw = await fs.readFile(opsFreshnessPath(), "utf8")
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return false
    return isChannelContentStale(parsed as OpsFreshnessData)
  } catch {
    return false
  }
}
