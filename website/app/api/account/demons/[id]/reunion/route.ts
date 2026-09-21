import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isValidDemonId } from "@/lib/armory-demons"
import { fetchLiveArmoryStats } from "@/lib/armory-live"
import {
  applyDemonReunionUpdates,
  demonOfflineCheckNames,
  demonOwnedByUsername,
} from "@/lib/demon-reunion-edit"
import {
  MITAMA_BONUS_ID_MAX,
  MITAMA_RANK_MAX,
  MITAMA_REUNION_SLOT_COUNT,
  REUNION_BRANCH_COUNT,
  REUNION_RANK_MAX,
} from "@/lib/demon-reunion-edit-shared"
import { GROWTH_TYPE_MAX } from "@/lib/growth-type-catalog"
import { canEditDemonReunion } from "@/lib/demon-reunion-edit-settings"
import { LobbyDbMissingError } from "@/lib/lobby-db"
import { WorldDbMissingError } from "@/lib/world-db"
import { requireWebSession } from "@/lib/web-session"

const bodySchema = z.object({
  reunion: z
    .array(z.number().int().min(0).max(REUNION_RANK_MAX))
    .length(REUNION_BRANCH_COUNT),
  mitamaReunion: z
    .array(z.number().int().min(0).max(MITAMA_BONUS_ID_MAX))
    .length(MITAMA_REUNION_SLOT_COUNT),
  mitamaRank: z.number().int().min(0).max(MITAMA_RANK_MAX),
  mitamaType: z.number().int().min(0).max(4),
  growthType: z.number().int().min(0).max(GROWTH_TYPE_MAX),
})

type Params = { params: Promise<{ id: string }> }

async function anyCharacterOnline(names: string[]): Promise<boolean> {
  for (const name of names) {
    const live = await fetchLiveArmoryStats(name)
    if (live?.ok && live.online) return true
  }
  return false
}

export async function POST(request: Request, { params }: Params) {
  const blocked = await guardApiMutation("demon-reunion-edit", 20, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")

  const { id: raw } = await params
  const id = decodeURIComponent(raw).trim().toLowerCase()
  if (!isValidDemonId(id)) {
    return apiFail("Invalid demon id", 400, "VALIDATION")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    if (!demonOwnedByUsername(id, session.username)) {
      return apiFail("Not your demon", 403, "FORBIDDEN")
    }
    if (!canEditDemonReunion(session.userLevel)) {
      return apiFail(
        "Demon reunion edit is not enabled for your GM level",
        403,
        "FORBIDDEN"
      )
    }

    const checkNames = demonOfflineCheckNames(id, session.username)
    if (await anyCharacterOnline(checkNames)) {
      return apiFail(
        "Character is online — log out of the game client first",
        409,
        "CHARACTER_ONLINE"
      )
    }

    const state = applyDemonReunionUpdates(id, parsed.data)
    return apiOk({ state })
  } catch (error) {
    if (
      error instanceof WorldDbMissingError ||
      error instanceof LobbyDbMissingError
    ) {
      return apiFail(error.message, 503, "DB")
    }
    return apiFail(
      error instanceof Error ? error.message : "Update failed",
      400,
      "UPDATE"
    )
  }
}
