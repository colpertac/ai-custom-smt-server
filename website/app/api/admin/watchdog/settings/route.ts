import { z } from "zod"

import { isAdminLevel } from "@/lib/admin-level"
import { apiFail, apiOk } from "@/lib/api-response"
import { getAllActiveMaintenanceWindows } from "@/lib/planned-maintenance"
import { loadWatchdogState } from "@/lib/server-watchdog"
import {
  getServerAlertSettings,
  setServerAlertSettings,
} from "@/lib/site-settings-store"
import { requireWebSession } from "@/lib/web-session"

const settingsSchema = z.object({
  discordWebhook: z.string().optional(),
  enabled: z.boolean().optional(),
  offlineThresholdSec: z.number().int().min(5).max(3600).optional(),
  mention: z.string().optional(),
})

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const settings = getServerAlertSettings()
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

  const updated = setServerAlertSettings(parsed.data)
  return apiOk(updated, "Watchdog settings saved")
}
