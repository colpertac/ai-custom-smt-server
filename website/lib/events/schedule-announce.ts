/**
 * In-game world announce for schedule restart countdown.
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

export function scheduleAnnounceMessage(kind: ScheduleAnnounceKind): string {
  if (kind === 10) {
    return "Server restarting in 10 minutes for scheduled event rotation."
  }
  if (kind === 5) {
    return "Server restarting in 5 minutes for scheduled event rotation."
  }
  return "Server restarting in 1 minute for scheduled event rotation."
}

export async function sendScheduleAnnounce(
  kind: ScheduleAnnounceKind
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
    const message = scheduleAnnounceMessage(kind)
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
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
