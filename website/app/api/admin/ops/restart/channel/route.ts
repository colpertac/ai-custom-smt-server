import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { syncEventScheduleToLive } from "@/lib/events/sync-event-schedule-live"
import { restartOpsChannel } from "@/lib/ops-sidecar"
import { setPlannedMaintenance } from "@/lib/planned-maintenance"
import { requireWebSession } from "@/lib/web-session"

export async function POST() {
  const blocked = await guardApiMutation("admin-ops-restart-channel", 5, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    // Schedule Save only writes JSON — channel restart is when we sync live.
    const sync = await syncEventScheduleToLive(session.username, {
      restart: true,
    })
    if (sync.error && sync.skippedReason !== "already_in_sync") {
      return apiFail(sync.error, 502, "EVENT_SCHEDULE_SYNC")
    }
    if (sync.synced && sync.restarted) {
      return apiOk(
        { ...sync, channelRestart: true },
        "Event schedule applied and channel restarted"
      )
    }

    setPlannedMaintenance(
      ["channel"],
      "admin_restart",
      180,
      session.username,
      "Channel restart"
    )

    const result = await restartOpsChannel(session.username)
    if (!result.ok) {
      const msg = result.detail || result.error || "Channel restart failed"
      return apiFail(msg, 502, "OPS")
    }
    return apiOk(
      { ...result, scheduleSync: sync },
      result.message || "Channel restarted"
    )
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Channel restart failed",
      502,
      "OPS"
    )
  }
}
