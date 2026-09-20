import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { disableAdminPackages } from "@/lib/recovery"
import {
  clearPlannedMaintenance,
  setPlannedMaintenance,
} from "@/lib/planned-maintenance"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-ops-recovery-disable-packages",
    3,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let clearAdminShops = false
  let restart = true
  try {
    const body = (await request.json()) as {
      clearAdminShops?: boolean
      restart?: boolean
    }
    if (body.clearAdminShops === true) clearAdminShops = true
    if (body.restart === false) restart = false
  } catch {
    /* empty */
  }

  if (restart) {
    setPlannedMaintenance(
      ["channel"],
      "recovery_disable_packages",
      180,
      session.username,
      "Recovery: disable admin packages"
    )
  }

  try {
    const result = await disableAdminPackages({
      actor: session.username,
      clearAdminShops,
      restart,
    })
    if (!result.ok) {
      if (restart) clearPlannedMaintenance(["channel"])
      return apiFail(result.message, 502, "RECOVERY")
    }
    return apiOk(result, result.message)
  } catch (error) {
    if (restart) clearPlannedMaintenance(["channel"])
    return apiFail(
      error instanceof Error ? error.message : "Disable packages failed",
      502,
      "RECOVERY"
    )
  }
}
