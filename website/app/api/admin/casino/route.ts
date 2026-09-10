import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  listWebGameFiles,
  WebGameConfigError,
} from "@/lib/webgames-fs"
import { requireWebSession } from "@/lib/web-session"

async function requireAdmin() {
  const session = await requireWebSession()
  if (!session) {
    return { error: apiFail("Unauthorized", 401, "UNAUTHORIZED") as Response }
  }
  if (!isAdminLevel(session.userLevel)) {
    return { error: apiFail("Forbidden", 403, "FORBIDDEN") as Response }
  }
  return { session }
}

export async function GET() {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  try {
    const data = await listWebGameFiles()
    return apiOk(data)
  } catch (error) {
    const status = error instanceof WebGameConfigError ? 404 : 500
    return apiFail(
      error instanceof Error ? error.message : "Failed to load casino games",
      status,
      "CASINO_WEBGAMES"
    )
  }
}
