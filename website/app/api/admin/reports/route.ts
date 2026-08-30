import { adminListReports } from "@/lib/comp-api"
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

const listSchema = z.object({
  resolved: z.boolean().optional(),
  playerName: z.string().trim().max(32).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  worldId: z.number().int().min(0).optional(),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-reports-list", 60, 60_000)
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

  const parsed = listSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const worldId = parsed.data.worldId ?? DEFAULT_WORLD_ID

  try {
    return await withCompSession(async (session) => {
      const reports = await adminListReports(session, {
        worldId,
        resolved: parsed.data.resolved ?? false,
        playerName: parsed.data.playerName || undefined,
        limit: parsed.data.limit ?? 100,
      })
      return apiOk({ worldId, reports })
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(compApiFailMessage(error, "List reports failed"), 502, "COMP")
  }
}
