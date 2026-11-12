import { isAdminLevel } from "@/lib/admin-level"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  getPlayerMetrics,
  parsePlayerMetricsRange,
} from "@/lib/player-count-metrics"
import { requireWebSession } from "@/lib/web-session"

/** GET /api/admin/metrics/players?range=24h|7d|30d */
export async function GET(request: Request) {
  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const url = new URL(request.url)
  const range = parsePlayerMetricsRange(url.searchParams.get("range"))
  return apiOk(getPlayerMetrics(range))
}
