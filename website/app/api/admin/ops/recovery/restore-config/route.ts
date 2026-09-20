import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { restoreLastConfig } from "@/lib/recovery"
import {
  clearPlannedMaintenance,
  setPlannedMaintenance,
} from "@/lib/planned-maintenance"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-ops-recovery-restore-config",
    3,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let syncWorking = true
  let restart = true
  try {
    const body = (await request.json()) as {
      syncWorking?: boolean
      restart?: boolean
    }
    if (body.syncWorking === false) syncWorking = false
    if (body.restart === false) restart = false
  } catch {
    /* empty */
  }

  if (restart) {
    setPlannedMaintenance(
      ["lobby", "world", "channel"],
      "recovery_restore_config",
      180,
      session.username,
      "Recovery: restore config"
    )
  }

  try {
    const result = await restoreLastConfig({
      actor: session.username,
      syncWorking,
      restart,
    })
    if (!result.ok) {
      if (restart) clearPlannedMaintenance(["lobby", "world", "channel"])
      const status = result.error === "no_config_release" ? 409 : 502
      return apiFail(result.message, status, "RECOVERY")
    }
    return apiOk(result, result.message)
  } catch (error) {
    if (restart) clearPlannedMaintenance(["lobby", "world", "channel"])
    return apiFail(
      error instanceof Error ? error.message : "Config restore failed",
      502,
      "RECOVERY"
    )
  }
}
