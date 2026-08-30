import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { isAdminLevel } from "@/lib/admin-level"
import { createEconomyPresetSchema } from "@/lib/cp-presets-schema"
import {
  CpPresetConflictError,
  createCpPreset,
  listCpPresets,
  restoreDefaultCpPresets,
} from "@/lib/cp-presets-store"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    return apiOk(listCpPresets())
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to list CP presets",
      500,
      "CP_PRESETS"
    )
  }
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-cp-presets-create", 30, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  if (
    body &&
    typeof body === "object" &&
    (body as { action?: string }).action === "restore-defaults"
  ) {
    try {
      const presets = restoreDefaultCpPresets()
      return apiOk(presets, "Built-in presets restored")
    } catch (error) {
      return apiFail(
        error instanceof Error ? error.message : "Failed to restore defaults",
        500,
        "CP_PRESETS"
      )
    }
  }

  const parsed = createEconomyPresetSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid body",
      400,
      "VALIDATION"
    )
  }

  try {
    const preset = createCpPreset(parsed.data)
    return apiOk(preset, "Created", { status: 201 })
  } catch (error) {
    if (error instanceof CpPresetConflictError) {
      return apiFail(error.message, 409, "CONFLICT")
    }
    return apiFail(
      error instanceof Error ? error.message : "Failed to create preset",
      500,
      "CP_PRESETS"
    )
  }
}
