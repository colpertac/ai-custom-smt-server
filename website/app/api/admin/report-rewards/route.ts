import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { listReportRewardDungeons } from "@/lib/report-rewards-fs"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const dungeons = await listReportRewardDungeons()
    return apiOk(dungeons)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to list dungeons",
      500,
      "REPORT_REWARDS"
    )
  }
}
