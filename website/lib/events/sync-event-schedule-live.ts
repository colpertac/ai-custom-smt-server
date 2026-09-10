/**
 * Apply current schedule desired events to live channel when they differ.
 * Used by Overview channel restart (and similar) — not by Save.
 */
import { conflictsInActiveSet } from "./event-conflicts"
import { updateActiveEvents } from "./events-fs"
import {
  getEventScheduleStatus,
  loadConflictGroups,
} from "./event-schedule-fs"
import { setsEqual } from "./event-schedule-math"
import {
  applyLaneAConfigOps,
  validateLaneAConfigOps,
} from "../lane-a-config-ops"
import { setPlannedMaintenance } from "../planned-maintenance"

export type SyncScheduleResult = {
  /** Wrote + applied channel because desired ≠ live. */
  synced: boolean
  desiredIds: string[]
  liveIds: string[]
  restarted: boolean
  skippedReason?: string
  error?: string
}

/**
 * If schedule is enabled and desired ≠ live, write working channel.xml,
 * Lane A config-apply, and optionally restart the channel.
 */
export async function syncEventScheduleToLive(
  actor: string,
  opts: { restart: boolean } = { restart: true }
): Promise<SyncScheduleResult> {
  const status = await getEventScheduleStatus()
  const desiredIds = status.desiredActiveIds
  const liveIds = status.liveActiveIds

  if (!status.config.enabled) {
    return {
      synced: false,
      desiredIds,
      liveIds,
      restarted: false,
      skippedReason: "schedule_disabled",
    }
  }

  if (setsEqual(desiredIds, liveIds)) {
    return {
      synced: false,
      desiredIds,
      liveIds,
      restarted: false,
      skippedReason: "already_in_sync",
    }
  }

  const groups = await loadConflictGroups()
  const conflicts = conflictsInActiveSet(desiredIds, groups)
  if (conflicts.length > 0) {
    return {
      synced: false,
      desiredIds,
      liveIds,
      restarted: false,
      skippedReason: "conflict",
      error: conflicts.map((c) => c.reason).join("; "),
    }
  }

  await updateActiveEvents(desiredIds)

  const validated = await validateLaneAConfigOps(actor, { only: ["channel"] })
  if (!validated.ok || !validated.releaseId) {
    return {
      synced: false,
      desiredIds,
      liveIds,
      restarted: false,
      skippedReason: "validate_failed",
      error:
        validated.error ||
        validated.errors?.join("; ") ||
        "Lane A config validate failed",
    }
  }

  if (opts.restart) {
    setPlannedMaintenance(
      ["channel", "world"],
      "admin_restart",
      180,
      actor,
      `Event schedule sync (${validated.releaseId})`
    )
  }

  const applied = await applyLaneAConfigOps(validated.releaseId, actor, {
    restart: opts.restart,
  })
  if (!applied.ok) {
    return {
      synced: false,
      desiredIds,
      liveIds,
      restarted: false,
      skippedReason: "apply_failed",
      error:
        applied.error ||
        applied.detail ||
        applied.errors?.join("; ") ||
        "Lane A config apply failed",
    }
  }

  return {
    synced: true,
    desiredIds,
    liveIds,
    restarted: opts.restart,
  }
}
