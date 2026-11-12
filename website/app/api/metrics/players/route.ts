import { apiOk } from "@/lib/api-response"
import {
  getPlayerMetrics,
  parsePlayerMetricsRange,
} from "@/lib/player-count-metrics"

/** GET /api/metrics/players?range=24h|7d|30d — public concurrent history. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const range = parsePlayerMetricsRange(url.searchParams.get("range"))
  return apiOk(getPlayerMetrics(range))
}
