import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getPublicAppUrl } from "@/lib/env"
import {
  getClientPrepSettings,
  setClientPrepSettings,
} from "@/lib/site-settings-store"
import { requireWebSession } from "@/lib/web-session"

const putSchema = z.object({
  host: z.string().trim().max(253).optional(),
  domain: z.string().trim().max(253).optional(),
  lobbyPort: z.string().trim().max(8).optional(),
  updaterPort: z.string().trim().max(8).optional(),
  loginPort: z.string().trim().max(8).optional(),
  title: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(40).optional(),
  websiteUrl: z.string().trim().max(2000).optional(),
  includeLocalServer: z.boolean().optional(),
  localTitle: z.string().trim().max(80).optional(),
  localHost: z.string().trim().max(253).optional(),
  localTag: z.string().trim().max(40).optional(),
})

function validateHttpUrl(url: string): boolean {
  if (!url) return true
  try {
    const u = new URL(url)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const prep = getClientPrepSettings()
  const site = getPublicAppUrl().replace(/\/$/, "")
  const defaultWebsiteUrl = `${site}/updater/news`
  return apiOk({
    prep: {
      ...prep,
      websiteUrl: prep.websiteUrl || defaultWebsiteUrl,
    },
    defaultWebsiteUrl,
  })
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation("admin-client-prep", 60, 60_000)
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

  if (
    parsed.data.websiteUrl !== undefined &&
    !validateHttpUrl(parsed.data.websiteUrl)
  ) {
    return apiFail("Website URL must be http(s)", 400, "VALIDATION")
  }

  const prep = setClientPrepSettings(parsed.data)
  return apiOk({ prep }, "Client prep saved")
}
