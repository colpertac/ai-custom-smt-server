import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { restoreLastContent } from "@/lib/recovery"
import {
  clearPlannedMaintenance,
  setPlannedMaintenance,
} from "@/lib/planned-maintenance"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-ops-recovery-restore-content",
    3,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let restart = true
  try {
    const body = (await request.json()) as { restart?: boolean }
    if (body.restart === false) restart = false
  } catch {
    /* empty */
  }

  if (restart) {
    setPlannedMaintenance(
      ["channel"],
      "recovery_restore_content",
      180,
      session.username,
      "Recovery: restore shops & loot"
    )
  }

  try {
    const result = await restoreLastContent({
      actor: session.username,
      restart,
    })
    if (!result.ok) {
      if (restart) clearPlannedMaintenance(["channel"])
      const status = result.error === "no_content_release" ? 409 : 502
      return apiFail(result.message, status, "RECOVERY")
    }
    return apiOk(result, result.message)
  } catch (error) {
    if (restart) clearPlannedMaintenance(["channel"])
    return apiFail(
      error instanceof Error ? error.message : "Shops/loot restore failed",
      502,
      "RECOVERY"
    )
  }
}
