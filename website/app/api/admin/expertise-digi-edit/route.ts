import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  getExpertiseDigiEditSettings,
  setExpertiseDigiEditSettings,
} from "@/lib/expertise-digi-edit-settings"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }
  return apiOk(getExpertiseDigiEditSettings())
}

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  minUserLevel: z.number().int().min(0).max(1000).optional(),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("admin-expertise-digi-edit", 30, 60_000)
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

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  if (
    parsed.data.enabled === undefined &&
    parsed.data.minUserLevel === undefined
  ) {
    return apiFail("Nothing to update", 400, "VALIDATION")
  }

  return apiOk(setExpertiseDigiEditSettings(parsed.data))
}
