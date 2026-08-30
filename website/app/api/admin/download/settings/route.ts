import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  getClientDownloadSettings,
  setClientDownloadSettings,
} from "@/lib/site-settings-store"
import { requireWebSession } from "@/lib/web-session"

const putSchema = z.object({
  url: z.string().trim().max(2000).optional(),
  label: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
})

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  return apiOk({ settings: getClientDownloadSettings() })
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation("admin-download-settings", 30, 60_000)
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

  if (parsed.data.url !== undefined && parsed.data.url.length > 0) {
    try {
      const u = new URL(parsed.data.url)
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return apiFail("URL must be http(s)", 400, "VALIDATION")
      }
    } catch {
      return apiFail("Invalid download URL", 400, "VALIDATION")
    }
  }

  const settings = setClientDownloadSettings(parsed.data)
  return apiOk({ settings }, "Saved")
}
