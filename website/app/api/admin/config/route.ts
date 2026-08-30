import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { listConfigStatus, seedWorkingFromLive } from "@/lib/server-config/fs"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    await seedWorkingFromLive()
    const files = await listConfigStatus()
    return apiOk({ files })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to list config",
      500,
      "CONFIG"
    )
  }
}
