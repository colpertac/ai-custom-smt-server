import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { applyLaneAConfigOps } from "@/lib/lane-a-config-ops"
import { setPlannedMaintenance } from "@/lib/planned-maintenance"
import { requireWebSession } from "@/lib/web-session"

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-ops-publish-lane-a-config-apply",
    3,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let releaseId = ""
  let restart = true
  try {
    const body = (await request.json()) as {
      releaseId?: string
      restart?: boolean
    }
    releaseId = body.releaseId?.trim() || ""
    if (body.restart === false) restart = false
  } catch {
    /* empty */
  }
  if (!releaseId) {
    return apiFail("releaseId is required", 400, "BAD_REQUEST")
  }

  if (restart) {
    setPlannedMaintenance(
      ["channel", "world"],
      "admin_restart",
      180,
      session.username,
      `Lane A config apply (${releaseId})`
    )
  }

  try {
    const result = await applyLaneAConfigOps(releaseId, session.username, {
      restart,
    })
    if (!result.ok) {
      const msg =
        result.error === "not_allowed"
          ? "Ops sidecar missing Lane A config apply verb. Restart pnpm run ops-sidecar."
          : result.detail ||
            result.error ||
            result.errors?.join("; ") ||
            "Config apply failed"
      return apiFail(msg, 502, "OPS")
    }
    return apiOk(result, result.message || "Config applied")
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Config apply failed",
      502,
      "OPS"
    )
  }
}
