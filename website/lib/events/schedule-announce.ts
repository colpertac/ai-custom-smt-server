/**
 * In-game world announce for scheduled downtime countdown.
 * Uses COMP lobby admin message_world (same as Admin Overview → Announce).
 */
import {
  adminMessageWorld,
  authenticate,
  type CompAuthState,
} from "@/lib/comp-api"
import { DEFAULT_WORLD_ID } from "@/lib/comp-api-errors"

const ANNOUNCE_MODE = 0 // red ticker — high visibility for restarts

export function getAnnounceCredentials(): {
  user: string
  password: string
} | null {
  const user = process.env.COMP_ANNOUNCE_USER?.trim()
  const password = process.env.COMP_ANNOUNCE_PASSWORD
  if (!user || password == null || password === "") return null
  return { user, password }
}

export type ScheduleAnnounceKind = 10 | 5 | 1

export type ScheduleAnnounceReason = "events" | "backup" | "combined"

export function scheduleAnnounceMessage(
  kind: ScheduleAnnounceKind,
  reason: ScheduleAnnounceReason = "events"
): string {
  const why =
    reason === "backup"
      ? "scheduled backup"
      : reason === "combined"
        ? "scheduled maintenance (events + backup)"
        : "scheduled event rotation"
  if (kind === 10) {
    return `Server restarting in 10 minutes for ${why}.`
  }
  if (kind === 5) {
    return `Server restarting in 5 minutes for ${why}.`
  }
  return `Server restarting in 1 minute for ${why}.`
}

async function sendWorldTicker(
  auth: CompAuthState,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const ticker = await adminMessageWorld(auth, {
    worldId: DEFAULT_WORLD_ID,
    message,
    type: "ticker",
    mode: ANNOUNCE_MODE,
    subMode: 0,
  })
  if (ticker.error !== "Success") {
    return { ok: false, error: ticker.error }
  }
  return { ok: true }
}

async function sendWorldConsole(
  auth: CompAuthState,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const consoleMsg = await adminMessageWorld(auth, {
    worldId: DEFAULT_WORLD_ID,
    message,
    type: "console",
    from: "",
  })
  if (consoleMsg.error !== "Success") {
    return { ok: false, error: consoleMsg.error }
  }
  return { ok: true }
}

/** Same shape as in-game `@announce` — ticker + console. */
async function sendAnnounceBoth(
  auth: CompAuthState,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const ticker = await sendWorldTicker(auth, message)
  if (!ticker.ok) return ticker
  return sendWorldConsole(auth, message)
}

export async function sendScheduleAnnounce(
  kind: ScheduleAnnounceKind,
  reason: ScheduleAnnounceReason = "events"
): Promise<{ ok: boolean; error?: string }> {
  const creds = getAnnounceCredentials()
  if (!creds) {
    return {
      ok: false,
      error:
        "COMP_ANNOUNCE_USER / COMP_ANNOUNCE_PASSWORD not set — skipping in-game announce",
    }
  }

  try {
    const auth: CompAuthState = await authenticate(creds.user, creds.password)
    return sendAnnounceBoth(auth, scheduleAnnounceMessage(kind, reason))
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Simple 10…1 second countdown, then return.
 * One auth, then for each number: announce (ticker+console) and sleep 1s.
 * Callers run this then immediately restart/stop services.
 */
export async function sendSecondCountdown(): Promise<{
  ok: boolean
  error?: string
}> {
  const creds = getAnnounceCredentials()
  if (!creds) {
    return {
      ok: false,
      error:
        "COMP_ANNOUNCE_USER / COMP_ANNOUNCE_PASSWORD not set — skipping in-game announce",
    }
  }

  try {
    const auth: CompAuthState = await authenticate(creds.user, creds.password)
    let lastError: string | undefined
    for (let n = 10; n >= 1; n -= 1) {
      const message = n === 10 ? "Server restarting in 10" : String(n)
      const sent = await sendAnnounceBoth(auth, message)
      if (!sent.ok) {
        lastError = sent.error
        console.warn(`[ScheduleAnnounce] countdown ${n}:`, sent.error)
      }
      if (n > 1) await sleep(1000)
    }
    return lastError ? { ok: false, error: lastError } : { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * 1-minute announce (if needed) → wait until ~10s before window → 10…1 → done.
 * Blocking; designed to run in the same tick that then restarts services.
 */
export async function runFinalMinuteSequence(opts: {
  windowAtMs: number
  reason?: ScheduleAnnounceReason
  alreadyAnnounced1?: boolean
}): Promise<{ ok: boolean; error?: string }> {
  const reason = opts.reason ?? "events"
  if (!opts.alreadyAnnounced1) {
    const ann = await sendScheduleAnnounce(1, reason)
    if (!ann.ok) {
      console.warn("[ScheduleAnnounce] announce 1m:", ann.error)
    }
  }

  const sleepBefore = Math.max(0, opts.windowAtMs - Date.now() - 10_000)
  if (sleepBefore > 0) {
    console.info(
      `[ScheduleAnnounce] final minute: sleeping ${Math.round(sleepBefore / 1000)}s before 10…1`
    )
    await sleep(sleepBefore)
  }

  console.info("[ScheduleAnnounce] final 10…1 countdown")
  return sendSecondCountdown()
}
