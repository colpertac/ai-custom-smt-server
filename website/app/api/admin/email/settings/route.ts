import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  getEmailSettingsForAdmin,
  setEmailSettings,
} from "@/lib/email-settings-store"
import { requireWebSession } from "@/lib/web-session"

const putSchema = z.object({
  publicSiteUrl: z.string().trim().max(500).optional(),
  fromEmail: z.string().trim().max(320).optional(),
  fromName: z.string().trim().max(120).optional(),
  supportEmail: z.string().trim().max(320).optional(),
  apiKey: z.string().trim().max(200).optional(),
  resetSecret: z.string().trim().min(16).max(256).optional(),
})

function validatePublicUrl(raw: string): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return "Site URL must be http(s)"
    }
    return null
  } catch {
    return "Invalid site URL"
  }
}

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  return apiOk({ settings: getEmailSettingsForAdmin() })
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation("admin-email-settings", 20, 60_000)
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

  if (parsed.data.publicSiteUrl !== undefined) {
    const err = validatePublicUrl(parsed.data.publicSiteUrl)
    if (err) return apiFail(err, 400, "VALIDATION")
  }

  if (parsed.data.fromEmail !== undefined && parsed.data.fromEmail.length > 0) {
    const email = parsed.data.fromEmail
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiFail("Invalid from email", 400, "VALIDATION")
    }
  }

  if (
    parsed.data.supportEmail !== undefined &&
    parsed.data.supportEmail.length > 0
  ) {
    const email = parsed.data.supportEmail
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiFail("Invalid support email", 400, "VALIDATION")
    }
  }

  const settings = setEmailSettings(parsed.data)
  return apiOk({ settings }, "Email settings saved")
}
