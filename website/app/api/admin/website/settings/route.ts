import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  ABOUT_MARKDOWN_MAX_CHARS,
  getAboutMarkdown,
  getWebsiteBranding,
  setAboutMarkdown,
  setWebsiteBrandingName,
} from "@/lib/site-settings-store"
import { requireWebSession } from "@/lib/web-session"

const putSchema = z
  .object({
    siteName: z.string().trim().min(1).max(80).optional(),
    aboutMarkdown: z.string().max(ABOUT_MARKDOWN_MAX_CHARS).optional(),
  })
  .refine(
    (v) => v.siteName !== undefined || v.aboutMarkdown !== undefined,
    { message: "Nothing to update" }
  )

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  return apiOk({
    branding: getWebsiteBranding(),
    aboutMarkdown: getAboutMarkdown(),
  })
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation("admin-website-settings", 30, 60_000)
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

  const branding =
    parsed.data.siteName !== undefined
      ? setWebsiteBrandingName(parsed.data.siteName)
      : getWebsiteBranding()
  const aboutMarkdown =
    parsed.data.aboutMarkdown !== undefined
      ? setAboutMarkdown(parsed.data.aboutMarkdown)
      : getAboutMarkdown()

  return apiOk({ branding, aboutMarkdown }, "Saved")
}
