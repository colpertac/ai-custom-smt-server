import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { bumpClientVersion } from "@/lib/client-version"
import { requireWebSession } from "@/lib/web-session"

export const runtime = "nodejs"
export const maxDuration = 180

export async function POST() {
  const blocked = await guardApiMutation(
    "admin-ops-client-version-bump",
    5,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const result = await bumpClientVersion(session.username)
    return apiOk(result, result.message)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Client version bump failed",
      502,
      "CLIENT_VERSION"
    )
  }
}
