import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  getStudioAccountsOverview,
  seedStudioMannequins,
} from "@/lib/studio-seed"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const overview = getStudioAccountsOverview()
    return apiOk(overview)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to load studio accounts",
      500,
      "STUDIO"
    )
  }
}

export async function POST(request: Request) {
  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: {
    vamPass?: string
    vafPass?: string
  } = {}

  try {
    const text = await request.text()
    if (text.trim()) {
      body = JSON.parse(text) as typeof body
    }
  } catch {
    return apiFail("Invalid JSON body", 400, "VALIDATION")
  }

  try {
    // Must use withCompSession: seed's best-effort lobby API sync rotates the
    // COMP challenge, and skipping persist leaves the cookie stale → 401 on
    // later admin pages (e.g. /admin/accounts).
    const result = await withCompSession(async (session) =>
      seedStudioMannequins({
        vamPass: body.vamPass,
        vafPass: body.vafPass,
        auth: session,
      })
    )
    return apiOk(result, result.message)
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to seed studio mannequins",
      500,
      "STUDIO"
    )
  }
}
