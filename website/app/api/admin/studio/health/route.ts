import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getStudioHealth } from "@/lib/studio-api"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const health = await getStudioHealth()
    if (!health.ok && health.error === "unauthorized") {
      return apiFail("Studio token rejected by channel", 502, "STUDIO")
    }
    return apiOk(health)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Studio health failed",
      502,
      "STUDIO"
    )
  }
}
