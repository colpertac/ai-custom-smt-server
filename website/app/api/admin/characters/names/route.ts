import {
  listAllCharacterNames,
  WorldDbMissingError,
} from "@/lib/admin-characters"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { requireWebSession } from "@/lib/web-session"

/** GET /api/admin/characters/names — full world character name list for autocomplete. */
export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const names = listAllCharacterNames()
    return apiOk({ names })
  } catch (error) {
    if (error instanceof WorldDbMissingError) {
      return apiFail(error.message, 503, "DB")
    }
    return apiFail(
      error instanceof Error ? error.message : "Character names failed",
      500,
      "ADMIN"
    )
  }
}
