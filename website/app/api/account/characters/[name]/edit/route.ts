import {
  characterOwnedByUsername,
  loadCharacterEditState,
} from "@/lib/character-expertise-digi"
import { canEditExpertiseDigi } from "@/lib/expertise-digi-edit-settings"
import { apiFail, apiOk } from "@/lib/api-response"
import { isValidCharacterName } from "@/lib/armory"
import { fetchLiveArmoryStats } from "@/lib/armory-live"
import { LobbyDbMissingError } from "@/lib/lobby-db"
import { WorldDbMissingError } from "@/lib/world-db"
import { requireWebSession } from "@/lib/web-session"

type Params = { params: Promise<{ name: string }> }

export async function GET(_request: Request, { params }: Params) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")

  const { name: raw } = await params
  const name = decodeURIComponent(raw).trim()
  if (!isValidCharacterName(name)) {
    return apiFail("Invalid character name", 400, "VALIDATION")
  }

  try {
    const owned = characterOwnedByUsername(name, session.username)
    const allowExpertiseDigiEdit = canEditExpertiseDigi(session.userLevel)
    const allowed = owned && allowExpertiseDigiEdit

    if (!allowed) {
      return apiOk({
        characterName: name,
        canEdit: false,
        owned,
        allowExpertiseDigiEdit,
        online: false,
        state: null,
      })
    }

    const live = await fetchLiveArmoryStats(name)
    const online = Boolean(live?.ok && live.online)
    const state = loadCharacterEditState(name)
    if (!state) {
      return apiFail("Character not found", 404, "NOT_FOUND")
    }

    return apiOk({
      characterName: state.characterName,
      canEdit: true,
      owned: true,
      allowExpertiseDigiEdit: true,
      online,
      state,
    })
  } catch (error) {
    if (
      error instanceof WorldDbMissingError ||
      error instanceof LobbyDbMissingError
    ) {
      return apiFail(error.message, 503, "DB")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to load edit state",
      500,
      "ERROR"
    )
  }
}
