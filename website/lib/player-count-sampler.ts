/**
 * Background sampler: lobby concurrent players → web.sqlite history.
 * Uses COMP_ANNOUNCE_* (same as public presence / report notify).
 */
import { adminGetOnline, authenticate } from "@/lib/comp-api"
import {
  pruneOldSamples,
  recordSample,
} from "@/lib/player-count-store"

export const PLAYER_COUNT_SAMPLE_INTERVAL_MS = 60_000

export type PlayerCountSampleSummary = {
  checkedAt: string
  skipped?: boolean
  skipReason?: string
  raw?: number
  real?: number
  pruned?: number
  error?: string
}

let lastErrorKey: string | null = null

function getServiceCredentials(): { user: string; password: string } | null {
  const user = process.env.COMP_ANNOUNCE_USER?.trim()
  const password = process.env.COMP_ANNOUNCE_PASSWORD
  if (!user || password == null || password === "") return null
  return { user, password }
}

function logErrorOnce(key: string, message: string): void {
  if (lastErrorKey === key) return
  lastErrorKey = key
  console.error(`[PlayerCountSampler] ${message}`)
}

function clearErrorBurst(): void {
  lastErrorKey = null
}

/** One sample tick — fail soft when lobby/creds are down. */
export async function runPlayerCountSample(): Promise<PlayerCountSampleSummary> {
  const checkedAt = new Date().toISOString()
  const creds = getServiceCredentials()
  if (!creds) {
    return {
      checkedAt,
      skipped: true,
      skipReason: "COMP_ANNOUNCE_USER / COMP_ANNOUNCE_PASSWORD not configured",
    }
  }

  try {
    const auth = await authenticate(creds.user, creds.password, {
      timeoutMs: 4_000,
    })
    const online = await adminGetOnline(auth)
    const raw = online.total
    // `real` once excluded portrait mannequins; it now equals `raw`.
    const real = raw
    const ts = Date.now()
    recordSample({ ts, raw, real })
    const pruned = pruneOldSamples(ts)
    clearErrorBurst()
    return { checkedAt, raw, real, pruned }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "player count sample failed"
    logErrorOnce(message, message)
    return { checkedAt, error: message }
  }
}
