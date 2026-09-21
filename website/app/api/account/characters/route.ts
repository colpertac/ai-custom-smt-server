import { listOwnedCharacters } from "@/lib/character-expertise-digi"
import { canEditDemonReunion } from "@/lib/demon-reunion-edit-settings"
import { canEditExpertiseDigi } from "@/lib/expertise-digi-edit-settings"
import { apiFail, apiOk } from "@/lib/api-response"
import { LobbyDbMissingError } from "@/lib/lobby-db"
import { WorldDbMissingError } from "@/lib/world-db"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")

  try {
    const characters = listOwnedCharacters(session.username)
    if (characters == null) {
      return apiFail("Account not found", 404, "NOT_FOUND")
    }
    return apiOk({
      username: session.username,
      allowExpertiseDigiEdit: canEditExpertiseDigi(session.userLevel),
      allowDemonReunionEdit: canEditDemonReunion(session.userLevel),
      characters,
    })
  } catch (error) {
    if (
      error instanceof WorldDbMissingError ||
      error instanceof LobbyDbMissingError
    ) {
      return apiFail(error.message, 503, "DB")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to list characters",
      500,
      "ERROR"
    )
  }
}
