import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { updateEconomyPresetSchema } from "@/lib/cp-presets-schema"
import {
  CpPresetNotFoundError,
  deleteCpPreset,
  updateCpPreset,
} from "@/lib/cp-presets-store"
import { requireWebSession } from "@/lib/web-session"

type Ctx = { params: Promise<{ id: string }> }

export async function PUT(request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("admin-cp-presets-update", 40, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const { id } = await ctx.params
  if (!id?.trim()) return apiFail("Missing id", 400, "BAD_REQUEST")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  const parsed = updateEconomyPresetSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  try {
    const preset = updateCpPreset(id, parsed.data)
    return apiOk(preset, "Saved")
  } catch (error) {
    if (error instanceof CpPresetNotFoundError) {
      return apiFail(error.message, 404, "NOT_FOUND")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to update preset",
      500,
      "CP_PRESETS"
    )
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("admin-cp-presets-delete", 30, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const { id } = await ctx.params
  if (!id?.trim()) return apiFail("Missing id", 400, "BAD_REQUEST")

  try {
    deleteCpPreset(id)
    return apiOk({ id }, "Deleted")
  } catch (error) {
    if (error instanceof CpPresetNotFoundError) {
      return apiFail(error.message, 404, "NOT_FOUND")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to delete preset",
      500,
      "CP_PRESETS"
    )
  }
}
