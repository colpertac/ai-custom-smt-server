/**
 * Periodic reconciler:
 * - Daily flipTime: announce 10/5/1 then apply+restart (even if ids match).
 * - Mid-cycle schedule edits: Save only — live stays until Overview channel
 *   restart (or the next daily flip). Pending is surfaced via desired ≠ live.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { updateActiveEvents } from "./events-fs"
import { conflictsInActiveSet } from "./event-conflicts"
import {
  computeDesiredActiveIds,
  mostRecentFlipInstant,
  nextFlipInstant,
  setsEqual,
} from "./event-schedule-math"
import {
  getEventSchedule,
  getLiveActiveEventIds,
  loadConflictGroups,
  writeReconcilerStatus,
  readReconcilerStatus,
  SCHEDULE_PATH,
  type ReconcilerPersistedStatus,
} from "./event-schedule-fs"
import { sendScheduleAnnounce } from "./schedule-announce"
import {
  applyOpsLaneAConfig,
  validateOpsLaneAConfig,
} from "../ops-sidecar"
import { setPlannedMaintenance } from "../planned-maintenance"
import { getRuntimeDir } from "../server-config/fs"

const ACTOR = "event-schedule-reconciler"
/** Still apply/restart if we come back online this soon after flip. */
const FLIP_CATCH_UP_MS = 15 * 60_000

function getLockPath(): string {
  if (process.env.EVENT_SCHEDULE_LOCK_DIR?.trim()) {
    return path.join(
      process.env.EVENT_SCHEDULE_LOCK_DIR.trim(),
      "event-schedule-reconciler.lock"
    )
  }
  return path.join(getRuntimeDir(), "locks", "event-schedule-reconciler.lock")
}

async function tryAcquireLock(): Promise<boolean> {
  const lockPath = getLockPath()
  await fs.mkdir(path.dirname(lockPath), { recursive: true })
  try {
    const handle = await fs.open(lockPath, "wx")
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() })
    )
    await handle.close()
    return true
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === "EEXIST") {
      try {
        const st = await fs.stat(lockPath)
        if (Date.now() - st.mtimeMs > 10 * 60_000) {
          await fs.unlink(lockPath)
          return tryAcquireLock()
        }
      } catch {
        /* ignore */
      }
      return false
    }
    throw err
  }
}

async function releaseLock(): Promise<void> {
  try {
    await fs.unlink(getLockPath())
  } catch {
    /* ignore */
  }
}

export type ReconcileResult = {
  applied: boolean
  skipped: boolean
  reason?: string
  desiredIds?: string[]
  error?: string
}

async function applyDesired(
  desiredIds: string[]
): Promise<{ ok: boolean; error?: string }> {
  await updateActiveEvents(desiredIds)

  const validated = await validateOpsLaneAConfig(ACTOR, {
    only: ["channel"],
  })
  if (!validated.ok || !validated.releaseId) {
    return {
      ok: false,
      error:
        validated.error ||
        validated.errors?.join("; ") ||
        "Lane A config validate failed",
    }
  }

  setPlannedMaintenance(
    ["channel", "world"],
    "admin_restart",
    180,
    ACTOR,
    `Event schedule flip (${validated.releaseId})`
  )

  const applied = await applyOpsLaneAConfig(validated.releaseId, ACTOR, {
    restart: true,
  })
  if (!applied.ok) {
    return {
      ok: false,
      error:
        applied.error ||
        applied.detail ||
        applied.errors?.join("; ") ||
        "Lane A config apply failed",
    }
  }
  return { ok: true }
}

function maintenanceSecondsUntil(restartAtMs: number, nowMs: number): number {
  return Math.max(60, Math.ceil((restartAtMs - nowMs) / 1000))
}

async function applyFlip(
  flipAt: Date,
  targetIds: string[]
): Promise<ReconcileResult> {
  const flipIso = flipAt.toISOString()
  const locked = await tryAcquireLock()
  if (!locked) {
    return {
      applied: false,
      skipped: true,
      reason: "lock_held",
      desiredIds: targetIds,
    }
  }

  try {
    console.info(
      `[EventSchedule] flip apply/restart at ${flipIso}; target=[${targetIds.join(",")}]`
    )
    const result = await applyDesired(targetIds)
    if (!result.ok) {
      await writeReconcilerStatus({
        lastError: result.error ?? "apply_failed",
        lastSkippedReason: "apply_failed",
        lastDesiredIds: targetIds,
      })
      return {
        applied: false,
        skipped: false,
        reason: "apply_failed",
        desiredIds: targetIds,
        error: result.error,
      }
    }

    await writeReconcilerStatus({
      lastAppliedAt: new Date().toISOString(),
      lastAppliedFlipAt: flipIso,
      lastDesiredIds: targetIds,
      lastError: null,
      lastSkippedReason: null,
      pendingRestartAt: null,
      pendingDesiredIds: [],
      announced10: false,
      announced5: false,
      announced1: false,
    })
    console.info(
      `[EventSchedule] applied ${targetIds.length} events → channel restart`,
      targetIds
    )
    return { applied: true, skipped: false, desiredIds: targetIds }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await writeReconcilerStatus({
      lastError: msg,
      lastSkippedReason: "exception",
      lastDesiredIds: targetIds,
    })
    return {
      applied: false,
      skipped: false,
      reason: "exception",
      desiredIds: targetIds,
      error: msg,
    }
  } finally {
    await releaseLock()
  }
}

async function runLeadInCountdown(
  now: Date,
  status: ReconcilerPersistedStatus,
  restartAt: Date,
  targetIds: string[],
  awaitingReason: "awaiting_flip" | "awaiting_drift"
): Promise<ReconcileResult> {
  const nowMs = now.getTime()
  const restartAtMs = restartAt.getTime()
  const restartAtIso = restartAt.toISOString()

  const flipChanged =
    status.pendingRestartAt !== restartAtIso ||
    !setsEqual(status.pendingDesiredIds, targetIds)

  let fresh: ReconcilerPersistedStatus = status
  if (flipChanged) {
    fresh = await writeReconcilerStatus({
      pendingRestartAt: restartAtIso,
      pendingDesiredIds: targetIds,
      announced10: false,
      announced5: false,
      announced1: false,
      lastDesiredIds: targetIds,
      lastSkippedReason: awaitingReason,
      lastError: null,
    })
    console.info(
      `[EventSchedule] ${awaitingReason} restart at ${restartAtIso}; target=[${targetIds.join(",")}]`
    )
  }

  const remaining = restartAtMs - nowMs

  if (
    remaining <= 10 * 60_000 &&
    remaining > 5 * 60_000 &&
    !fresh.announced10
  ) {
    const ann = await sendScheduleAnnounce(10)
    if (!ann.ok) console.warn("[EventSchedule] announce 10m:", ann.error)
    await writeReconcilerStatus({
      announced10: true,
      lastError: ann.ok ? null : ann.error ?? null,
      lastSkippedReason: "countdown_waiting",
    })
    setPlannedMaintenance(
      ["channel", "world"],
      "admin_restart",
      maintenanceSecondsUntil(restartAtMs, nowMs),
      ACTOR,
      "Event schedule flip countdown"
    )
  } else if (
    remaining <= 5 * 60_000 &&
    remaining > 60_000 &&
    !fresh.announced5
  ) {
    const ann = await sendScheduleAnnounce(5)
    if (!ann.ok) console.warn("[EventSchedule] announce 5m:", ann.error)
    await writeReconcilerStatus({
      announced10: true,
      announced5: true,
      lastError: ann.ok ? null : ann.error ?? null,
      lastSkippedReason: "countdown_waiting",
    })
    setPlannedMaintenance(
      ["channel", "world"],
      "admin_restart",
      maintenanceSecondsUntil(restartAtMs, nowMs),
      ACTOR,
      "Event schedule flip countdown"
    )
  } else if (remaining <= 60_000 && remaining > 0 && !fresh.announced1) {
    const ann = await sendScheduleAnnounce(1)
    if (!ann.ok) console.warn("[EventSchedule] announce 1m:", ann.error)
    await writeReconcilerStatus({
      announced10: true,
      announced5: true,
      announced1: true,
      lastError: ann.ok ? null : ann.error ?? null,
      lastSkippedReason: "countdown_waiting",
    })
    setPlannedMaintenance(
      ["channel", "world"],
      "admin_restart",
      maintenanceSecondsUntil(restartAtMs, nowMs),
      ACTOR,
      "Event schedule flip countdown"
    )
  } else {
    await writeReconcilerStatus({
      lastSkippedReason:
        remaining <= 10 * 60_000 ? "countdown_waiting" : awaitingReason,
      lastDesiredIds: targetIds,
    })
  }

  return {
    applied: false,
    skipped: true,
    reason: remaining <= 10 * 60_000 ? "countdown_waiting" : awaitingReason,
    desiredIds: targetIds,
  }
}

export async function runEventScheduleReconcile(
  now: Date = new Date()
): Promise<ReconcileResult> {
  await writeReconcilerStatus({ lastTickAt: now.toISOString() })

  const config = await getEventSchedule()
  if (!config.enabled) {
    console.warn(
      `[EventSchedule] skipped: schedule_disabled (enabled=${config.enabled}, path=${SCHEDULE_PATH})`
    )
    await writeReconcilerStatus({
      lastSkippedReason: "schedule_disabled",
      lastError: null,
      pendingRestartAt: null,
      pendingDesiredIds: [],
      announced10: false,
      announced5: false,
      announced1: false,
    })
    return { applied: false, skipped: true, reason: "schedule_disabled" }
  }

  const nowMs = now.getTime()
  const groups = await loadConflictGroups()
  const status = await readReconcilerStatus()

  const dueFlip = mostRecentFlipInstant(config, now)
  const dueFlipMs = dueFlip.getTime()
  const dueFlipIso = dueFlip.toISOString()
  const alreadyAppliedThisFlip = status.lastAppliedFlipAt === dueFlipIso

  if (!alreadyAppliedThisFlip && nowMs >= dueFlipMs) {
    const ageMs = nowMs - dueFlipMs
    const pendingMs = status.pendingRestartAt
      ? Date.parse(status.pendingRestartAt)
      : NaN
    const pendingWasThisFlip =
      Number.isFinite(pendingMs) && Math.abs(pendingMs - dueFlipMs) < 2_000
    const shouldCatchUp = ageMs <= FLIP_CATCH_UP_MS || pendingWasThisFlip

    if (shouldCatchUp) {
      const targetIds = computeDesiredActiveIds(config, dueFlip)
      const conflicts = conflictsInActiveSet(targetIds, groups)
      if (conflicts.length > 0) {
        const msg = conflicts.map((c) => c.reason).join("; ")
        await writeReconcilerStatus({
          lastError: msg,
          lastSkippedReason: "conflict",
          lastDesiredIds: targetIds,
          pendingRestartAt: dueFlipIso,
          pendingDesiredIds: targetIds,
        })
        return {
          applied: false,
          skipped: true,
          reason: "conflict",
          desiredIds: targetIds,
          error: msg,
        }
      }
      // Always restart at flip — even if live ids already match.
      return applyFlip(dueFlip, targetIds)
    }

    // Flip was hours ago and never recorded — acknowledge without restarting.
    await writeReconcilerStatus({
      lastAppliedFlipAt: dueFlipIso,
      lastSkippedReason: "flip_ack_stale",
      lastError: null,
    })
  }

  const liveIds = await getLiveActiveEventIds()
  const currentDesired = computeDesiredActiveIds(config, now)
  const liveMatchesCurrent = setsEqual(currentDesired, liveIds)

  if (!liveMatchesCurrent) {
    const conflicts = conflictsInActiveSet(currentDesired, groups)
    if (conflicts.length > 0) {
      const msg = conflicts.map((c) => c.reason).join("; ")
      await writeReconcilerStatus({
        lastError: msg,
        lastSkippedReason: "conflict",
        lastDesiredIds: currentDesired,
      })
      return {
        applied: false,
        skipped: true,
        reason: "conflict",
        desiredIds: currentDesired,
        error: msg,
      }
    }

    // Drift is intentional until admin restarts (Overview) or flip fires.
    await writeReconcilerStatus({
      lastDesiredIds: currentDesired,
      lastSkippedReason: "awaiting_manual_restart",
      lastError: null,
    })
    console.info(
      `[EventSchedule] live≠desired (awaiting Overview restart or flip); desired=[${currentDesired.join(",")}] live=[${liveIds.join(",")}]`
    )
  }

  // Arm the next daily flip/restart (applies even when already in sync).
  const flipAt = nextFlipInstant(config, now)
  const targetIds = computeDesiredActiveIds(config, flipAt)

  const conflicts = conflictsInActiveSet(targetIds, groups)
  if (conflicts.length > 0) {
    const msg = conflicts.map((c) => c.reason).join("; ")
    await writeReconcilerStatus({
      lastError: msg,
      lastSkippedReason: "conflict",
      lastDesiredIds: targetIds,
      pendingRestartAt: flipAt.toISOString(),
      pendingDesiredIds: targetIds,
      announced10: false,
      announced5: false,
      announced1: false,
    })
    return {
      applied: false,
      skipped: true,
      reason: "conflict",
      desiredIds: targetIds,
      error: msg,
    }
  }

  return runLeadInCountdown(now, status, flipAt, targetIds, "awaiting_flip")
}

export function getReconcilerLockPath(): string {
  return getLockPath()
}
