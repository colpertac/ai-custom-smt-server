import { adminResolveReport } from "@/lib/comp-api"
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

const resolveSchema = z.object({
  uid: z.string().trim().min(1),
  worldId: z.number().int().min(0).optional(),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-reports-resolve", 30, 60_000)
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

  const parsed = resolveSchema.safeParse(body)
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
      const result = await adminResolveReport(session, {
        worldId,
        uid: parsed.data.uid,
      })
      if (result.error !== "Success") {
        return apiFail(result.error, 400, "RESOLVE")
      }
      return apiOk({ uid: parsed.data.uid, worldId }, "Report resolved")
    })
  } catch (error) {
    if (error instanceof CompSessionMissingError) {
      return apiFail("Unauthorized", 401, "UNAUTHORIZED")
    }
    return apiFail(compApiFailMessage(error, "Resolve failed"), 502, "COMP")
  }
}
