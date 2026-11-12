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
}

export type OnlinePresenceRoster = {
  total: number
  players: OnlinePresencePlayer[]
}

export function formatPresencePos(x?: number, y?: number): string {
  if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
    return "—"
  }
  return `${x.toFixed(1)}, ${y.toFixed(1)}`
}
