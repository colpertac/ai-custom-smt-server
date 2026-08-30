import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getOpsHealth } from "@/lib/ops-sidecar"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const health = await getOpsHealth(session.username)
    if (!health.ok && health.error === "unauthorized") {
      return apiFail("Ops token rejected by sidecar", 502, "OPS")
    }
    return apiOk(health)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Ops sidecar health failed",
      502,
      "OPS"
    )
  }
}
