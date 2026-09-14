import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getClientVersionStatus } from "@/lib/client-version"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const status = await getClientVersionStatus()
    return apiOk(status, "OK", { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return apiFail(
      error instanceof Error
        ? error.message
        : "Failed to read client version",
      500,
      "CLIENT_VERSION"
    )
  }
}
