/**
 * Presence record shape shared by Admin → Players and (later) Phase 18
 * friends / launcher presence APIs. Lobby `/admin/list_online` is the
 * admin-full source today; a privacy-filtered friends endpoint will reuse
 * the same fields.
 */

export type OnlinePresenceStatus = "online" | "world"

export type OnlinePresencePlayer = {
  account: string
  character: string
  worldId: number
  channelId: number
  zoneId: number
  status: OnlinePresenceStatus
  /** Map X when the channel has reported coordinates. */
  x?: number
  /** Map Y when the channel has reported coordinates. */
  y?: number
  /** Studio portrait mannequin (vam / vaf), not a real player. */
  mannequin?: boolean
}

export type OnlinePresenceRoster = {
  total: number
  players: OnlinePresencePlayer[]
}

/** Character names used by studio dress mannequins. */
const MANNEQUIN_NAMES = new Set(["vam", "vaf", "vam1", "vaf1"])

export function isStudioMannequinName(character: string): boolean {
  const key = character.trim().toLowerCase()
  if (!key) return false
  if (MANNEQUIN_NAMES.has(key)) return true
  // Allow vam2 / vaf2 style suffixes if added later.
  return /^va[mf]\d*$/i.test(key)
}

export function tagMannequins(
  players: OnlinePresencePlayer[]
): OnlinePresencePlayer[] {
  return players.map((p) =>
    isStudioMannequinName(p.character) ? { ...p, mannequin: true } : p
  )
}

export function formatPresencePos(x?: number, y?: number): string {
  if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
    return "—"
  }
  return `${x.toFixed(1)}, ${y.toFixed(1)}`
}
