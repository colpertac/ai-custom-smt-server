import { adminListOnline } from "@/lib/comp-api"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { tagMannequins } from "@/lib/presence"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"

/** GET /api/admin/players/online — live presence roster from lobby. */
export async function GET() {
  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const roster = await withCompSession(async (session) =>
      adminListOnline(session)
    )
    const players = tagMannequins(roster.players)
    return apiOk({
      total: roster.total,
      players,
      realPlayers: players.filter((p) => !p.mannequin).length,
      mannequins: players.filter((p) => p.mannequin).length,
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to list online players",
      502,
      "COMP"
    )
  }
}
