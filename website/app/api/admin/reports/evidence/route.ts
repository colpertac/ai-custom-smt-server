import { adminListChatLogs } from "@/lib/comp-api"
import { compApiFailMessage, DEFAULT_WORLD_ID } from "@/lib/comp-api-errors"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  CompSessionMissingError,
  requireWebSession,
  withCompSession,
} from "@/lib/web-session"
import { z } from "zod"

const evidenceSchema = z.object({
  playerName: z.string().trim().min(1).max(32),
  reportTime: z.number().int().min(0),
  worldId: z.number().int().min(0).optional(),
  windowSeconds: z.number().int().min(60).max(86_400).optional(),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-reports-evidence", 60, 60_000)
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

  const parsed = evidenceSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const windowSec = parsed.data.windowSeconds ?? 30 * 60
  const until = parsed.data.reportTime
  const since = until > windowSec ? until - windowSec : 0
  const worldId = parsed.data.worldId ?? DEFAULT_WORLD_ID

  try {
    return await withCompSession(async (session) => {
      const logs = await adminListChatLogs(session, {
        worldId,
        characterName: parsed.data.playerName,
        since,
        until,
        limit: 100,
      })
      return apiOk({ worldId, since, until, logs: [...logs].reverse() })
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(
      compApiFailMessage(error, "Evidence lookup failed"),
      502,
      "COMP"
    )
  }
}
