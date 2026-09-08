import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  readChannelStudioToken,
  syncChannelStudioToken,
} from "@/lib/studio-channel-sync"
import {
  getEffectiveStudioToken,
  getStudioConnectionForAdmin,
  setStudioConnectionSettings,
} from "@/lib/studio-settings-store"
import { requireWebSession } from "@/lib/web-session"

const putSchema = z.object({
  studioUrl: z.string().trim().max(500).optional(),
  previewUrl: z.string().trim().max(500).optional(),
  studioToken: z.string().max(500).optional(),
  workerToken: z.string().max(500).optional(),
  clearStudioToken: z.boolean().optional(),
  clearWorkerToken: z.boolean().optional(),
  /** When true (default if studioToken set), also write channel.xml + publish/restart. */
  syncChannelToken: z.boolean().optional(),
})

function validateHttpUrl(raw: string, label: string): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return `${label} must be http(s)`
    }
    return null
  } catch {
    return `Invalid ${label}`
  }
}

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const settings = getStudioConnectionForAdmin()
  let channelTokenConfigured = false
  let channelTokenMatchesWebsite = false
  try {
    const channelToken = await readChannelStudioToken()
    channelTokenConfigured = Boolean(channelToken)
    const websiteToken = getEffectiveStudioToken()
    channelTokenMatchesWebsite = Boolean(
      channelToken && websiteToken && channelToken === websiteToken
    )
  } catch {
    /* channel config may be missing on fresh installs */
  }

  return apiOk({
    settings: {
      ...settings,
      channelTokenConfigured,
      channelTokenMatchesWebsite,
    },
  })
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation("admin-studio-settings", 10, 60_000)
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

  if (parsed.data.studioUrl !== undefined) {
    const err = validateHttpUrl(parsed.data.studioUrl, "Studio URL")
    if (err) return apiFail(err, 400, "VALIDATION")
  }
  if (parsed.data.previewUrl !== undefined && parsed.data.previewUrl) {
    const err = validateHttpUrl(parsed.data.previewUrl, "Preview URL")
    if (err) return apiFail(err, 400, "VALIDATION")
  }

  const settings = setStudioConnectionSettings(parsed.data)

  let channelSync:
    | Awaited<ReturnType<typeof syncChannelStudioToken>>
    | undefined
  const tokenToSync = parsed.data.studioToken?.trim()
  const shouldSync =
    Boolean(tokenToSync) && parsed.data.syncChannelToken !== false

  if (shouldSync && tokenToSync) {
    try {
      channelSync = await syncChannelStudioToken(
        tokenToSync,
        session.username
      )
    } catch (e) {
      return apiOk(
        {
          settings: {
            ...settings,
            channelTokenConfigured: false,
            channelTokenMatchesWebsite: false,
          },
          channelSync: {
            draftUpdated: false,
            published: false,
            restarted: false,
            message: "Website token saved; channel sync failed",
            warning: e instanceof Error ? e.message : "channel sync failed",
          },
        },
        "Website studio settings saved (channel sync failed)"
      )
    }
  }

  let channelTokenConfigured = settings.studioTokenConfigured
  let channelTokenMatchesWebsite = false
  try {
    const channelToken = await readChannelStudioToken()
    channelTokenConfigured = Boolean(channelToken)
    const websiteToken = getEffectiveStudioToken()
    channelTokenMatchesWebsite = Boolean(
      channelToken && websiteToken && channelToken === websiteToken
    )
  } catch {
    /* ignore */
  }

  const message = channelSync?.message || "Studio connection settings saved"

  return apiOk(
    {
      settings: {
        ...settings,
        channelTokenConfigured,
        channelTokenMatchesWebsite,
      },
      channelSync,
    },
    message
  )
}
