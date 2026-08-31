import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { getPublicAppUrl } from "@/lib/env"
import { publishUpdaterSiteViaSidecar } from "@/lib/ops-sidecar"
import {
  getClientPrepSettings,
  getUpdaterSiteSettings,
  setClientPrepSettings,
  setUpdaterSiteSettings,
} from "@/lib/site-settings-store"
import { requireWebSession } from "@/lib/web-session"

const putSchema = z.object({
  websiteUrl: z.string().trim().max(2000).optional(),
  pageTitle: z.string().trim().max(80).optional(),
  serverLabel: z.string().trim().max(120).optional(),
  publish: z.boolean().optional(),
})

function validateHttpUrl(url: string): string | null {
  if (!url) return ""
  try {
    const u = new URL(url)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    return url
  } catch {
    return null
  }
}

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const settings = getUpdaterSiteSettings()
  const site = getPublicAppUrl().replace(/\/$/, "")
  return apiOk({
    settings,
    defaultWebsiteUrl: `${site}/updater/news`,
  })
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation("admin-updater-site", 30, 60_000)
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

  if (parsed.data.websiteUrl !== undefined && parsed.data.websiteUrl.length > 0) {
    const valid = validateHttpUrl(parsed.data.websiteUrl)
    if (valid === null) {
      return apiFail("Website URL must be http(s)", 400, "VALIDATION")
    }
  }

  const settings = setUpdaterSiteSettings({
    websiteUrl: parsed.data.websiteUrl,
    pageTitle: parsed.data.pageTitle,
  })
  if (parsed.data.websiteUrl !== undefined || parsed.data.pageTitle !== undefined) {
    setClientPrepSettings({
      websiteUrl: settings.websiteUrl,
      title: settings.pageTitle || undefined,
    })
  }

  const shouldPublish = parsed.data.publish !== false
  if (shouldPublish) {
    try {
      const result = await publishUpdaterSiteViaSidecar(
        {
          title: settings.pageTitle || parsed.data.pageTitle || "Private SMT",
          websiteUrl: settings.websiteUrl,
          serverLabel: parsed.data.serverLabel,
        },
        session.username
      )
      if (!result.ok) {
        return apiFail(
          result.detail || "Failed to publish updater page",
          502,
          "OPS"
        )
      }
      return apiOk(
        { settings },
        result.message || "Updater page published"
      )
    } catch (e) {
      return apiFail(
        e instanceof Error ? e.message : "Ops sidecar unreachable",
        502,
        "OPS"
      )
    }
  }

  return apiOk({ settings }, "Saved")
}
