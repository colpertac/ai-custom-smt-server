import {
  applyDemonReunionUpdates,
  demonOfflineCheckNames,
  demonOwnedByUsername,
  loadDemonEditState,
} from "@/lib/demon-reunion-edit"
import { canEditDemonReunion } from "@/lib/demon-reunion-edit-settings"
import { apiFail, apiOk } from "@/lib/api-response"
import { isValidDemonId } from "@/lib/armory-demons"
import { fetchLiveArmoryStats } from "@/lib/armory-live"
import { LobbyDbMissingError } from "@/lib/lobby-db"
import { WorldDbMissingError } from "@/lib/world-db"
import { requireWebSession } from "@/lib/web-session"

type Params = { params: Promise<{ id: string }> }

async function anyCharacterOnline(names: string[]): Promise<boolean> {
  for (const name of names) {
    const live = await fetchLiveArmoryStats(name)
    if (live?.ok && live.online) return true
  }
  return false
}

export async function GET(_request: Request, { params }: Params) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")

  const { id: raw } = await params
  const id = decodeURIComponent(raw).trim().toLowerCase()
  if (!isValidDemonId(id)) {
    return apiFail("Invalid demon id", 400, "VALIDATION")
  }

  try {
    const owned = demonOwnedByUsername(id, session.username)
    const allowDemonReunionEdit = canEditDemonReunion(session.userLevel)
    const allowed = owned && allowDemonReunionEdit

    if (!allowed) {
      return apiOk({
        demonId: id,
        canEdit: false,
        owned,
        allowDemonReunionEdit,
        online: false,
        ownerCharacter: null,
        state: null,
      })
    }

    const state = loadDemonEditState(id)
    if (!state) {
      return apiFail("Demon not found", 404, "NOT_FOUND")
    }

    const checkNames = demonOfflineCheckNames(id, session.username)
    const online = await anyCharacterOnline(checkNames)

    return apiOk({
      demonId: state.demonId,
      canEdit: true,
      owned: true,
      allowDemonReunionEdit: true,
      online,
      ownerCharacter: state.ownerCharacter,
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
