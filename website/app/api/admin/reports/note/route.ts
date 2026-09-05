import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { DEFAULT_WORLD_ID } from "@/lib/comp-api-errors"
import { upsertReportNote } from "@/lib/report-notes-store"
import { requireWebSession } from "@/lib/web-session"
import { z } from "zod"

const noteSchema = z.object({
  uid: z.string().trim().min(1).max(64),
  note: z.string().max(4000),
  worldId: z.number().int().min(0).optional(),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-reports-note", 60, 60_000)
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

  const parsed = noteSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const worldId = parsed.data.worldId ?? DEFAULT_WORLD_ID
  const saved = upsertReportNote({
    worldId,
    uid: parsed.data.uid,
    note: parsed.data.note,
    updatedBy: gate.username,
  })

  return apiOk(
    {
      worldId,
      uid: saved.uid,
      note: saved.note,
      noteUpdatedBy: saved.updatedBy,
      noteUpdatedAt: saved.updatedAt,
    },
    saved.note ? "Note saved" : "Note cleared"
  )
}
