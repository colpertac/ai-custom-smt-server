import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getLaneAPendingStatus } from "@/lib/lane-a-publish"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const status = await getLaneAPendingStatus()
    return apiOk(status)
  } catch (error) {
    return apiFail(
      error instanceof Error
        ? error.message
        : "Failed to check shops & payouts publish status",
      500,
      "LANE_A_STATUS"
    )
  }
}
