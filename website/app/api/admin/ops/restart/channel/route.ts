import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { restartOpsChannel } from "@/lib/ops-sidecar"
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
    const result = await restartOpsChannel(session.username)
    if (!result.ok) {
      const msg =
        result.detail ||
        result.error ||
        "Channel restart failed"
      return apiFail(msg, 502, "OPS")
    }
    return apiOk(
      result,
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
