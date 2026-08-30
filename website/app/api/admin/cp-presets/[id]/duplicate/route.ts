import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { duplicateEconomyPresetSchema } from "@/lib/cp-presets-schema"
import {
  CpPresetConflictError,
  CpPresetNotFoundError,
  duplicateCpPreset,
} from "@/lib/cp-presets-store"
import { requireWebSession } from "@/lib/web-session"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation(
    "admin-cp-presets-duplicate",
    30,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const { id } = await ctx.params
  if (!id?.trim()) return apiFail("Missing id", 400, "BAD_REQUEST")

  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const parsed = duplicateEconomyPresetSchema.safeParse(body ?? {})
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  try {
    const preset = duplicateCpPreset(id, parsed.data.label)
    return apiOk(preset, "Duplicated", { status: 201 })
  } catch (error) {
    if (error instanceof CpPresetNotFoundError) {
      return apiFail(error.message, 404, "NOT_FOUND")
    }
    if (error instanceof CpPresetConflictError) {
      return apiFail(error.message, 409, "CONFLICT")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to duplicate preset",
      500,
      "CP_PRESETS"
    )
  }
}
