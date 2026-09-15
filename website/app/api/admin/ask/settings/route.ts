import { z } from "zod"

import {
  clearAtlasCloudApiKey,
  getAskAtlasAdminSettings,
  setAskLlmEnabled,
  setAtlasCloudApiKey,
} from "@/lib/ask-atlas-settings-store"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { requireWebSession } from "@/lib/web-session"

const putSchema = z
  .object({
    apiKey: z.string().trim().min(8).max(512).optional(),
    clear: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.apiKey !== undefined ||
      v.clear === true ||
      v.enabled !== undefined,
    { message: "Nothing to update" }
  )

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  return apiOk({ settings: getAskAtlasAdminSettings() })
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation("admin-ask-settings", 20, 60_000)
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
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  if (parsed.data.clear) {
    clearAtlasCloudApiKey()
  } else if (parsed.data.apiKey !== undefined) {
    setAtlasCloudApiKey(parsed.data.apiKey)
  }

  if (parsed.data.enabled !== undefined) {
    setAskLlmEnabled(parsed.data.enabled)
  }

  return apiOk({ settings: getAskAtlasAdminSettings() }, "Ask settings saved")
}
