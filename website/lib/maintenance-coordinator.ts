/**
 * Coordinates scheduled cold backups with event-flip downtime.
 *
 * When backup announce is enabled, this owns 10/5/1 lead-in and execution.
 * If the next event flip falls within coalesceMinutes of the next backup,
 * both run in one COMP stop window (backup copy → event apply → start).
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import {
  computeDesiredActiveIds,
  nextFlipInstant,
} from "@/lib/events/event-schedule-math"
import {
  applyEventScheduleIds,
  markEventFlipApplied,
} from "@/lib/events/event-schedule-reconciler"
import { getEventSchedule } from "@/lib/events/event-schedule-fs"
import { eventsDataDir } from "@/lib/events/events-paths"
import {
  runFinalMinuteSequence,
  sendScheduleAnnounce,
  type ScheduleAnnounceReason,
} from "@/lib/events/schedule-announce"
import {
  getOpsBackupJob,
  listOpsBackups,
  runOpsBackup,
  startOpsServices,
  syncOpsBackup,
  type OpsBackupSchedule,
} from "@/lib/ops-sidecar"
import { setPlannedMaintenance } from "@/lib/planned-maintenance"

const ACTOR = "maintenance-coordinator"
const LEAD_IN_MS = 10 * 60_000

export type MaintenanceWindowKind = "backup" | "combined"

export type MaintenanceCoordinatorStatus = {
  windowAt: string | null
  /** Event flip instant when includeEvents (may differ from windowAt). */
  flipAt: string | null
  kind: MaintenanceWindowKind | null
  includeBackup: boolean
  includeEvents: boolean
  announced10: boolean
  announced5: boolean
  announced1: boolean
  /** Final 10…1 second countdown armed. */
  announcedSeconds: boolean
  lastExecutedWindowAt: string | null
  lastError: string | null
  nextBackupAt: string | null
  nextFlipAt: string | null
  coalesced: boolean
  executing: boolean
}

const emptyStatus = (): MaintenanceCoordinatorStatus => ({
  windowAt: null,
  flipAt: null,
  kind: null,
  includeBackup: false,
  includeEvents: false,
  announced10: false,
  announced5: false,
  announced1: false,
  announcedSeconds: false,
  lastExecutedWindowAt: null,
  lastError: null,
  nextBackupAt: null,
  nextFlipAt: null,
  coalesced: false,
  executing: false,
})

function statusPath(): string {
  return path.join(eventsDataDir(), "maintenance-coordinator-status.json")
}

export async function getMaintenanceCoordinatorStatus(): Promise<MaintenanceCoordinatorStatus> {
  try {
    const raw = await fs.readFile(statusPath(), "utf8")
    const parsed = JSON.parse(raw) as Partial<MaintenanceCoordinatorStatus>
    return { ...emptyStatus(), ...parsed }
  } catch {
    return emptyStatus()
  }
}

async function writeStatus(
  patch: Partial<MaintenanceCoordinatorStatus>
): Promise<MaintenanceCoordinatorStatus> {
  const prev = await getMaintenanceCoordinatorStatus()
  const next: MaintenanceCoordinatorStatus = { ...prev, ...patch }
  await fs.mkdir(eventsDataDir(), { recursive: true })
  await fs.writeFile(statusPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8")
  return next
}

/** True when the event reconciler must defer flip execute/lead-in to us. */
export async function isEventFlipOwnedByCoordinator(
  flipAt: Date,
  now: Date = new Date()
): Promise<boolean> {
  const status = await getMaintenanceCoordinatorStatus()
  if (!status.windowAt || !status.includeEvents || status.kind == null) {
    return false
  }
  if (status.executing && status.includeEvents) return true
  const flipMs = flipAt.getTime()
  const ownedFlipMs = status.flipAt
    ? Date.parse(status.flipAt)
    : Date.parse(status.windowAt)
  if (!Number.isFinite(ownedFlipMs)) return false
  if (Math.abs(ownedFlipMs - flipMs) < 2_000) return true
  const windowMs = Date.parse(status.windowAt)
  const remaining = windowMs - now.getTime()
  if (
    Number.isFinite(windowMs) &&
    remaining > -FLIP_CATCH_MS &&
    remaining <= LEAD_IN_MS &&
    status.includeEvents
  ) {
    return Math.abs(ownedFlipMs - flipMs) <= 15 * 60_000
  }
  return false
}

const FLIP_CATCH_MS = 15 * 60_000

function nextBackupAtFromSchedule(sched: OpsBackupSchedule): Date | null {
  if (!sched.enabled) return null
  if (sched.announceEnabled === false) {
    // announce off → ops scheduler owns it; coordinator idle for backup
    return null
  }
  const intervalH = Math.max(1, Number(sched.intervalHours) || 24)
  const last = sched.lastRunAt
  if (!last) return null
  const lastMs = Date.parse(last)
  if (!Number.isFinite(lastMs)) return null
  // May be in the past when overdue — execute path catches up.
  return new Date(lastMs + intervalH * 3600_000)
}

function maintenanceSecondsUntil(atMs: number, nowMs: number): number {
  return Math.max(60, Math.ceil((atMs - nowMs) / 1000))
}

async function waitForBackupJob(
  jobId: string,
  timeoutMs = 1_800_000
): Promise<{ ok: boolean; error?: string }> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const job = await getOpsBackupJob(jobId, ACTOR)
    if (job.finished) {
      if (job.result?.ok) return { ok: true }
      return {
        ok: false,
        error:
          job.result?.error ||
          job.result?.detail ||
          job.error ||
          "backup_failed",
      }
    }
    if (job.error === "unknown_job" || job.error === "unauthorized") {
      return { ok: false, error: job.error }
    }
    await new Promise((r) => setTimeout(r, 2_000))
  }
  return { ok: false, error: "backup_job_timeout" }
}

async function executeWindow(
  status: MaintenanceCoordinatorStatus,
  now: Date
): Promise<void> {
  const windowAt = status.windowAt
  if (!windowAt || status.executing) return

  await writeStatus({ executing: true, lastError: null })
  const reason: ScheduleAnnounceReason =
    status.kind === "combined" ? "combined" : "backup"
  const maintReason =
    status.kind === "combined" ? "scheduled_maintenance" : "scheduled_backup"

  setPlannedMaintenance(
    ["lobby", "world", "channel"],
    maintReason,
    900,
    ACTOR,
    `${reason} window ${windowAt}`
  )

  try {
    if (status.includeBackup) {
      const list = await listOpsBackups(ACTOR)
      const mode =
        list.schedule?.mode === "full" ? ("full" as const) : ("standard" as const)
      const sync =
        Boolean(list.schedule?.remote) && Boolean(list.schedule?.rcloneConfigured)
      const started = await runOpsBackup(ACTOR, {
        mode,
        sync: false, // sync after start
        noStart: true,
      })
      if (!started.ok || !started.jobId) {
        throw new Error(started.detail || started.error || "backup_start_failed")
      }
      const waited = await waitForBackupJob(started.jobId)
      if (!waited.ok) throw new Error(waited.error || "backup_failed")
    }

    if (status.includeEvents) {
      const config = await getEventSchedule()
      if (config.enabled) {
        const flipAt = status.flipAt
          ? new Date(status.flipAt)
          : new Date(windowAt)
        const targetIds = computeDesiredActiveIds(config, flipAt)
        const applied = await applyEventScheduleIds(targetIds, {
          restart: false,
        })
        if (!applied.ok) {
          throw new Error(applied.error || "event_apply_failed")
        }
        await markEventFlipApplied(flipAt, targetIds)
      }
    }

    const start = await startOpsServices(
      ["lobby", "world", "channel"],
      ACTOR
    )
    if (!start.ok) {
      throw new Error(start.detail || start.error || "start_failed")
    }

    // rclone after stack is up (no player downtime)
    if (status.includeBackup) {
      try {
        await syncOpsBackup(ACTOR)
      } catch (err) {
        console.warn(
          "[MaintenanceCoordinator] sync after backup:",
          err instanceof Error ? err.message : err
        )
      }
    }

    await writeStatus({
      executing: false,
      lastExecutedWindowAt: windowAt,
      windowAt: null,
      flipAt: null,
      kind: null,
      includeBackup: false,
      includeEvents: false,
      announced10: false,
      announced5: false,
      announced1: false,
      announcedSeconds: false,
      lastError: null,
    })
    console.info(
      `[MaintenanceCoordinator] completed ${reason} window at ${windowAt}`
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[MaintenanceCoordinator] execute failed:", msg)
    // Best-effort bring stack back
    try {
      await startOpsServices(["lobby", "world", "channel"], ACTOR)
    } catch {
      /* ignore */
    }
    await writeStatus({
      executing: false,
      lastError: msg,
      lastExecutedWindowAt: windowAt,
    })
  }
}

export async function runMaintenanceCoordinator(
  now: Date = new Date()
): Promise<MaintenanceCoordinatorStatus> {
  let status = await getMaintenanceCoordinatorStatus()
  if (status.executing) return status

  let backupSched: OpsBackupSchedule = {}
  try {
    const list = await listOpsBackups(ACTOR)
    backupSched = list.schedule || {}
  } catch (err) {
    // Ops down — skip backup arming; events reconciler still runs alone.
    console.warn(
      "[MaintenanceCoordinator] ops backup list failed:",
      err instanceof Error ? err.message : err
    )
    status = await writeStatus({
      nextBackupAt: null,
      lastError:
        err instanceof Error ? err.message : "ops_backup_list_failed",
    })
  }

  const announceOn =
    backupSched.enabled &&
    (backupSched.announceEnabled === undefined ||
      backupSched.announceEnabled === true)
  const coalesceMinutes = Math.max(
    0,
    Number(backupSched.coalesceMinutes ?? 10) || 10
  )
  const coalesceMs = coalesceMinutes * 60_000

  const nextBackup = announceOn ? nextBackupAtFromSchedule(backupSched) : null

  const eventConfig = await getEventSchedule()
  const nextFlip =
    eventConfig.enabled ? nextFlipInstant(eventConfig, now) : null

  status = await writeStatus({
    nextBackupAt: nextBackup?.toISOString() ?? null,
    nextFlipAt: nextFlip?.toISOString() ?? null,
  })

  // Decide window
  let windowAt: Date | null = null
  let flipAtForEvents: Date | null = null
  let includeBackup = false
  let includeEvents = false
  let kind: MaintenanceWindowKind | null = null
  let coalesced = false

  if (nextBackup && nextFlip && coalesceMs > 0) {
    const diff = Math.abs(nextBackup.getTime() - nextFlip.getTime())
    if (diff <= coalesceMs) {
      windowAt =
        nextBackup.getTime() <= nextFlip.getTime() ? nextBackup : nextFlip
      flipAtForEvents = nextFlip
      includeBackup = true
      includeEvents = true
      kind = "combined"
      coalesced = true
    }
  }

  if (!windowAt && nextBackup) {
    windowAt = nextBackup
    flipAtForEvents = null
    includeBackup = true
    includeEvents = false
    kind = "backup"
    coalesced = false
  }

  // Event-only stays on the event reconciler (lighter channel restart).

  if (!windowAt || !kind) {
    return writeStatus({
      windowAt: null,
      flipAt: null,
      kind: null,
      includeBackup: false,
      includeEvents: false,
      coalesced: false,
      announced10: false,
      announced5: false,
      announced1: false,
      announcedSeconds: false,
    })
  }

  const windowIso = windowAt.toISOString()
  const flipIso = flipAtForEvents?.toISOString() ?? null
  const windowChanged =
    status.windowAt !== windowIso ||
    status.kind !== kind ||
    status.flipAt !== flipIso

  if (windowChanged) {
    status = await writeStatus({
      windowAt: windowIso,
      flipAt: flipIso,
      kind,
      includeBackup,
      includeEvents,
      coalesced,
      announced10: false,
      announced5: false,
      announced1: false,
      announcedSeconds: false,
      lastError: null,
    })
    console.info(
      `[MaintenanceCoordinator] armed ${kind} window at ${windowIso}` +
        (coalesced ? " (coalesced with event flip)" : "")
    )
  }

  const nowMs = now.getTime()
  const windowMs = windowAt.getTime()
  const remaining = windowMs - nowMs

  // Execute when due (including slight overdue catch-up).
  if (remaining <= 0 && remaining > -FLIP_CATCH_MS) {
    if (status.lastExecutedWindowAt === windowIso || status.executing) {
      return status
    }
    if (!status.announcedSeconds) {
      const overdueReason: ScheduleAnnounceReason =
        kind === "combined" ? "combined" : "backup"
      await writeStatus({
        announced10: true,
        announced5: true,
        announced1: true,
        announcedSeconds: true,
        executing: true,
      })
      try {
        const seq = await runFinalMinuteSequence({
          windowAtMs: windowMs,
          reason: overdueReason,
          alreadyAnnounced1: status.announced1,
        })
        if (!seq.ok) {
          console.warn(
            "[MaintenanceCoordinator] final countdown (catch-up):",
            seq.error
          )
        }
        await writeStatus({ executing: false })
        const fresh = await getMaintenanceCoordinatorStatus()
        await executeWindow(fresh, now)
      } catch (err) {
        await writeStatus({
          executing: false,
          lastError: err instanceof Error ? err.message : String(err),
        })
        throw err
      }
      return getMaintenanceCoordinatorStatus()
    }
    await executeWindow(status, now)
    return getMaintenanceCoordinatorStatus()
  }

  if (remaining <= 0) {
    // Stale window — clear
    return writeStatus({
      windowAt: null,
      flipAt: null,
      kind: null,
      includeBackup: false,
      includeEvents: false,
      announced10: false,
      announced5: false,
      announced1: false,
      announcedSeconds: false,
    })
  }

  const announceReason: ScheduleAnnounceReason =
    kind === "combined" ? "combined" : "backup"
  const maintReason =
    kind === "combined" ? "scheduled_maintenance" : "scheduled_backup"

  if (remaining <= 10 * 60_000 && remaining > 5 * 60_000 && !status.announced10) {
    const ann = await sendScheduleAnnounce(10, announceReason)
    if (!ann.ok) console.warn("[MaintenanceCoordinator] announce 10m:", ann.error)
    setPlannedMaintenance(
      ["lobby", "world", "channel"],
      maintReason,
      maintenanceSecondsUntil(windowMs, nowMs),
      ACTOR,
      `${kind} countdown`
    )
    return writeStatus({
      announced10: true,
      lastError: ann.ok ? null : ann.error ?? null,
    })
  }

  if (remaining <= 5 * 60_000 && remaining > 60_000 && !status.announced5) {
    const ann = await sendScheduleAnnounce(5, announceReason)
    if (!ann.ok) console.warn("[MaintenanceCoordinator] announce 5m:", ann.error)
    setPlannedMaintenance(
      ["lobby", "world", "channel"],
      maintReason,
      maintenanceSecondsUntil(windowMs, nowMs),
      ACTOR,
      `${kind} countdown`
    )
    return writeStatus({
      announced10: true,
      announced5: true,
      lastError: ann.ok ? null : ann.error ?? null,
    })
  }

  if (remaining <= 60_000 && remaining > 0 && !status.announcedSeconds) {
    // Mark executing early so a concurrent tick cannot double-run.
    await writeStatus({
      announced10: true,
      announced5: true,
      announced1: true,
      announcedSeconds: true,
      executing: true,
      lastError: null,
    })
    setPlannedMaintenance(
      ["lobby", "world", "channel"],
      maintReason,
      Math.max(60, Math.ceil(remaining / 1000) + 15),
      ACTOR,
      `${kind} countdown`
    )
    try {
      const seq = await runFinalMinuteSequence({
        windowAtMs: windowMs,
        reason: announceReason,
        alreadyAnnounced1: status.announced1,
      })
      if (!seq.ok) {
        console.warn("[MaintenanceCoordinator] final countdown:", seq.error)
        await writeStatus({ lastError: seq.error ?? null })
      }
      // executeWindow no-ops if executing — clear flag then run body once.
      await writeStatus({ executing: false })
      const fresh = await getMaintenanceCoordinatorStatus()
      await executeWindow(fresh, new Date())
    } catch (err) {
      await writeStatus({
        executing: false,
        lastError: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
    return getMaintenanceCoordinatorStatus()
  }

  return status
}
