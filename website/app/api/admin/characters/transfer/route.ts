import { adminTransferCharacter } from "@/lib/comp-api"
import { mapCharacterLobbyError } from "@/lib/admin-character-api"
import { compApiFailMessage } from "@/lib/comp-api-errors"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"
import { z } from "zod"

const schema = z.object({
  characterName: z.string().trim().min(1).max(32),
  toUsername: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((s) => s.toLowerCase()),
  worldId: z.number().int().min(0).optional(),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-char-transfer", 20, 60_000)
  if (blocked) return blocked

  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    return await withCompSession(async (session) => {
      const result = await adminTransferCharacter(session, {
        character_name: parsed.data.characterName,
        to_username: parsed.data.toUsername,
        world_id: parsed.data.worldId,
      })
      if (result.error !== "Success") {
        return apiFail(mapCharacterLobbyError(result.error), 400, "TRANSFER")
      }
      return apiOk({
        name: result.name ?? parsed.data.characterName,
        toUsername: result.to_username ?? parsed.data.toUsername,
      })
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(compApiFailMessage(error, "Transfer failed"), 502, "COMP")
  }
}
