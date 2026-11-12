"use client"

import { PlayerConcurrentChart } from "@/features/status/components/PlayerConcurrentChart"
import type { PlayerMetricsRange } from "@/lib/player-count-metrics"

/** Admin Players chart — same UI as public /status, admin API path. */
export function AdminPlayerChart({
  defaultRange = "24h",
}: {
  defaultRange?: PlayerMetricsRange
} = {}) {
  return (
    <PlayerConcurrentChart
      apiPath="admin/metrics/players"
      defaultRange={defaultRange}
      description="Players online over time. Sampled every minute while the website is running."
      emptyMessage="Collecting samples… the chart fills after a few minutes once the website sampler is running."
    />
  )
}

export type { PlayerMetricsRange }
