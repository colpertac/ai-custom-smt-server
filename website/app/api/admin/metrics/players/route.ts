import { isAdminLevel } from "@/lib/admin-level"
import { apiFail, apiOk } from "@/lib/api-response"
import {
  latestSample,
  listSamples,
  type PlayerCountPoint,
} from "@/lib/player-count-store"
import { requireWebSession } from "@/lib/web-session"

export type PlayerMetricsRange = "24h" | "7d" | "30d"

const RANGE_MS: Record<PlayerMetricsRange, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
}

/** Downsample bucket size — raw 60s for 24h; coarser for longer windows. */
const RANGE_BUCKET_SECONDS: Record<PlayerMetricsRange, number> = {
  "24h": 0,
  "7d": 5 * 60,
  "30d": 15 * 60,
}

function parseRange(raw: string | null): PlayerMetricsRange {
  if (raw === "7d" || raw === "30d" || raw === "24h") return raw
  return "24h"
}

function summarize(points: PlayerCountPoint[]): {
  current: number | null
  peak: number | null
  average: number | null
} {
  if (points.length === 0) {
    return { current: null, peak: null, average: null }
  }
  let peak = points[0]!.real
  let sum = 0
  for (const p of points) {
    if (p.real > peak) peak = p.real
    sum += p.real
  }
  const latest = latestSample()
  return {
    current: latest?.real ?? points[points.length - 1]!.real,
    peak,
    average: Math.round((sum / points.length) * 10) / 10,
  }
}

/** GET /api/admin/metrics/players?range=24h|7d|30d */
export async function GET(request: Request) {
  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const url = new URL(request.url)
  const range = parseRange(url.searchParams.get("range"))
  const now = Date.now()
  const sinceTs = now - RANGE_MS[range]
  const points = listSamples({
    sinceTs,
    untilTs: now,
    bucketSeconds: RANGE_BUCKET_SECONDS[range],
  })
  const { current, peak, average } = summarize(points)

  return apiOk({
    range,
    current,
    peak,
    average,
    sampleCount: points.length,
    points,
  })
}
