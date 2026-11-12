import { getRenderWorkerStatus } from "@/lib/admin-portrait-queue"
import { isAdminLevel } from "@/lib/admin-level"
import { apiFail, apiOk } from "@/lib/api-response"
import { probeStudioConnection } from "@/lib/studio-api"
import { getEffectivePortraitWorkerToken } from "@/lib/studio-settings-store"
import { requireWebSession } from "@/lib/web-session"

export const dynamic = "force-dynamic"

/**
 * Admin → Portraits status: can the website reach the channel studio API (live armory
 * stats), and is a render worker sending heartbeats. Never returns tokens or URLs.
 */
export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const liveStats = await probeStudioConnection()

  let renderWorker: ReturnType<typeof getRenderWorkerStatus> | null = null
  let renderWorkerError: string | undefined
  try {
    renderWorker = getRenderWorkerStatus()
  } catch (e) {
    renderWorkerError =
      e instanceof Error ? e.message : "Render worker status failed"
  }

  const workerTokenConfigured = Boolean(getEffectivePortraitWorkerToken())

  return apiOk({
    liveStats,
    workerTokenConfigured,
    renderWorker,
    renderWorkerError,
    /** True when install-provided settings are missing or do not match the channel. */
    misconfigured:
      liveStats === "not_configured" ||
      liveStats === "rejected" ||
      !workerTokenConfigured,
  })
}
