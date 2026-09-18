import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { apiFail, apiOk } from "@/lib/api-response"
import { getAllActiveMaintenanceWindows } from "@/lib/planned-maintenance"
import { loadWatchdogState } from "@/lib/server-watchdog"
import {
  getNotificationSettings,
  setNotificationSettings,
} from "@/lib/site-settings-store"
import { requireWebSession } from "@/lib/web-session"

/**
 * @deprecated Prefer /api/admin/notifications/settings.
 * Kept for compatibility; maps enabled ↔ notifyServicesDown.
 */
const settingsSchema = z.object({
  discordWebhook: z.string().optional(),
  enabled: z.boolean().optional(),
  offlineThresholdSec: z.number().int().min(5).max(3600).optional(),
  mention: z.string().optional(),
  notifyServicesDown: z.boolean().optional(),
  notifyMannequins: z.boolean().optional(),
  notifyFeedback: z.boolean().optional(),
  notifyReports: z.boolean().optional(),
})

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const n = getNotificationSettings()
  const settings = {
    discordWebhook: n.discordWebhook,
    enabled: n.notifyServicesDown,
    offlineThresholdSec: n.offlineThresholdSec,
    mention: n.mention,
    notifyServicesDown: n.notifyServicesDown,
    notifyMannequins: n.notifyMannequins,
    notifyFeedback: n.notifyFeedback,
    notifyReports: n.notifyReports,
  }
  const maintenanceWindows = getAllActiveMaintenanceWindows()
  const watchdogState = loadWatchdogState()

  return apiOk({
    settings,
    maintenanceWindows,
    watchdogState,
  })
}

export async function POST(request: Request) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON body", 400, "BAD_REQUEST")
  }

  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid settings input",
      400,
      "VALIDATION"
    )
  }

  const { enabled, notifyServicesDown, ...rest } = parsed.data
  const updated = setNotificationSettings({
    ...rest,
    notifyServicesDown:
      notifyServicesDown !== undefined ? notifyServicesDown : enabled,
  })
  return apiOk(
    {
      ...updated,
      enabled: updated.notifyServicesDown,
    },
    "Watchdog settings saved"
  )
}
