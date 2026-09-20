import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { resetStockKnobs } from "@/lib/recovery"
import {
  clearPlannedMaintenance,
  setPlannedMaintenance,
} from "@/lib/planned-maintenance"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-ops-recovery-reset-stock-knobs",
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
      ["lobby", "world", "channel"],
      "recovery_reset_stock",
      180,
      session.username,
      "Recovery: reset stock knobs"
    )
  }

  try {
    const result = await resetStockKnobs({
      actor: session.username,
      restart,
    })
    if (!result.ok) {
      if (restart) clearPlannedMaintenance(["lobby", "world", "channel"])
      return apiFail(result.message, 502, "RECOVERY")
    }
    return apiOk(result, result.message)
  } catch (error) {
    if (restart) clearPlannedMaintenance(["lobby", "world", "channel"])
    return apiFail(
      error instanceof Error ? error.message : "Stock reset failed",
      502,
      "RECOVERY"
    )
  }
}
