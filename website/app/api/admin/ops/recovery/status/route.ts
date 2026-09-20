import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getRecoveryStatus } from "@/lib/recovery"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const status = await getRecoveryStatus()
    return apiOk(status)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Could not load recovery status",
      502,
      "RECOVERY"
    )
  }
}
