import { getSiteSetting, setSiteSetting } from "@/lib/site-settings-store"

export type MaintenanceReason =
  | "admin_restart"
  | "admin_stop"
  | "map_upload"
  | "content_upload"
  | "manual"

export type MaintenanceWindow = {
  service: string
  reason: MaintenanceReason
  startedAt: number
  expiresAt: number | null
  actor?: string
  detail?: string
}

const KEY_MAINTENANCE = "server_planned_maintenance"

// In-memory fallback in case DB is unavailable (e.g. lightweight test environments)
let memStore: Record<string, MaintenanceWindow> | null = null

function loadWindows(now = Date.now()): Record<string, MaintenanceWindow> {
  let raw: string | null = null
  try {
    raw = getSiteSetting(KEY_MAINTENANCE)
  } catch {
    // If SQLite is unavailable in testing or serverless, use memStore
  }

  let parsed: Record<string, MaintenanceWindow> = {}
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, MaintenanceWindow>
    } catch {
      parsed = {}
    }
  } else if (memStore) {
    parsed = { ...memStore }
  }

  // Filter out expired windows
  const active: Record<string, MaintenanceWindow> = {}
  for (const [key, win] of Object.entries(parsed)) {
    if (!win) continue
    if (win.expiresAt === null || win.expiresAt > now) {
      active[key] = win
    }
  }
  return active
}

function saveWindows(windows: Record<string, MaintenanceWindow>): void {
  memStore = { ...windows }
  try {
    setSiteSetting(KEY_MAINTENANCE, JSON.stringify(windows))
  } catch {
    // SQLite fallback silently handled
  }
}

/**
 * Register a planned maintenance window for one or more services.
 * @param services List of services ("lobby", "world", "channel", or "all")
 * @param reason Purpose of the maintenance
 * @param durationSec Duration in seconds (null = indefinite, e.g. admin_stop until started)
 * @param actor Admin user initiating the action
 * @param detail Optional description (e.g. map filename)
 * @param now Current timestamp ms (defaults to Date.now())
 */
export function setPlannedMaintenance(
  services: string[],
  reason: MaintenanceReason,
  durationSec: number | null,
  actor?: string,
  detail?: string,
  now = Date.now()
): void {
  const expiresAt = durationSec != null ? now + durationSec * 1000 : null
  const current = loadWindows(now)

  for (const s of services) {
    const key = s.trim().toLowerCase()
    current[key] = {
      service: key,
      reason,
      startedAt: now,
      expiresAt,
      actor,
      detail,
    }
  }

  saveWindows(current)
}

/**
 * Remove planned maintenance for one or more services.
 */
export function clearPlannedMaintenance(services: string[]): void {
  const now = Date.now()
  const current = loadWindows(now)

  for (const s of services) {
    const key = s.trim().toLowerCase()
    delete current[key]
  }

  saveWindows(current)
}

/**
 * Check if a service is currently under planned maintenance.
 * Matches specific service name or generic "all".
 */
export function isServiceInMaintenance(
  service: string,
  now = Date.now()
): { inMaintenance: boolean; window?: MaintenanceWindow } {
  const current = loadWindows(now)
  const key = service.trim().toLowerCase()

  if (current[key]) {
    return { inMaintenance: true, window: current[key] }
  }
  if (current["all"]) {
    return { inMaintenance: true, window: current["all"] }
  }

  return { inMaintenance: false }
}

/**
 * Retrieve all currently active maintenance windows.
 */
export function getAllActiveMaintenanceWindows(
  now = Date.now()
): MaintenanceWindow[] {
  const current = loadWindows(now)
  return Object.values(current)
}
