import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getMaintenanceCoordinatorStatus } from "@/lib/maintenance-coordinator"
import { listOpsBackups } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const result = await listOpsBackups(session.username)
    if (!result.ok) {
      return apiFail(
        result.detail || result.error || "Backup list failed",
        result.error === "not_allowed" ? 502 : 502,
        "OPS"
      )
    }
    const maintenance = await getMaintenanceCoordinatorStatus().catch(() => null)
    return apiOk({ ...result, maintenance })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Backup list failed",
      502,
      "OPS"
    )
  }
}
