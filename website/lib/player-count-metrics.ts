/**
 * Shared concurrent-player metrics query for admin + public APIs.
 * Only exposes the "real" series (mannequins already excluded at sample time).
 */
import {
  latestSample,
  listSamples,
  type PlayerCountPoint,
} from "@/lib/player-count-store"

export type PlayerMetricsRange = "24h" | "7d" | "30d"

export type PlayerMetricsPayload = {
  range: PlayerMetricsRange
  current: number | null
  peak: number | null
  average: number | null
  sampleCount: number
  points: { ts: number; real: number }[]
}

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

export function parsePlayerMetricsRange(
  raw: string | null
): PlayerMetricsRange {
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

export function getPlayerMetrics(
  range: PlayerMetricsRange,
  now = Date.now()
): PlayerMetricsPayload {
  const sinceTs = now - RANGE_MS[range]
  const points = listSamples({
    sinceTs,
    untilTs: now,
    bucketSeconds: RANGE_BUCKET_SECONDS[range],
  })
  const { current, peak, average } = summarize(points)
  return {
    range,
    current,
    peak,
    average,
    sampleCount: points.length,
    points,
  }
}
