import { z } from "zod"

import { canEditExpertiseDigi } from "@/lib/expertise-digi-edit-settings"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isValidCharacterName } from "@/lib/armory"
import { fetchLiveArmoryStats } from "@/lib/armory-live"
import {
  applyExpertiseUpdates,
  characterOwnedByUsername,
} from "@/lib/character-expertise-digi"
import { LobbyDbMissingError } from "@/lib/lobby-db"
import { WorldDbMissingError } from "@/lib/world-db"
import { requireWebSession } from "@/lib/web-session"

const bodySchema = z.object({
  updates: z
    .array(
      z.object({
        expertiseId: z.number().int().min(0).max(37),
        classLevel: z.number().int().min(0).max(20).optional(),
        rank: z.number().int().min(0).max(9).optional(),
        points: z.number().int().min(0).optional(),
      })
    )
    .min(1)
    .max(40),
})

type Params = { params: Promise<{ name: string }> }

export async function POST(request: Request, { params }: Params) {
  const blocked = await guardApiMutation("char-expertise-edit", 20, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")

  const { name: raw } = await params
  const name = decodeURIComponent(raw).trim()
  if (!isValidCharacterName(name)) {
    return apiFail("Invalid character name", 400, "VALIDATION")
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
    if (!characterOwnedByUsername(name, session.username)) {
      return apiFail("Not your character", 403, "FORBIDDEN")
    }
    if (!canEditExpertiseDigi(session.userLevel)) {
      return apiFail(
        "Expertise/digi edit is not enabled for your GM level",
        403,
        "FORBIDDEN"
      )
    }

    const live = await fetchLiveArmoryStats(name)
    if (live?.ok && live.online) {
      return apiFail(
        "Character is online — log out of the game client first",
        409,
        "CHARACTER_ONLINE"
      )
    }

    const state = applyExpertiseUpdates(name, parsed.data.updates)
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
