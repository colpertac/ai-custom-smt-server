"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { FormAlert } from "@/components/form-alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { fetcher } from "@/lib/fetcher"
import { cn } from "@/lib/utils"

export type PlayerMetricsRange = "24h" | "7d" | "30d"

type PlayerMetricsResponse = {
  range: PlayerMetricsRange
  current: number | null
  peak: number | null
  average: number | null
  sampleCount: number
  points: { ts: number; real: number }[]
}

const RANGES: { id: PlayerMetricsRange; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
]

const REFRESH_MS = 60_000

function formatTick(ts: number, range: PlayerMetricsRange): string {
  const d = new Date(ts)
  if (range === "24h") {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(range === "7d"
      ? { hour: "2-digit", minute: "2-digit" }
      : {}),
  })
}

function formatTooltipTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[5.5rem]">
      <div className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-lg tabular-nums text-foreground">
        {value}
      </div>
    </div>
  )
}

export function AdminPlayerChart({
  compact = false,
  defaultRange = "24h",
}: {
  compact?: boolean
  defaultRange?: PlayerMetricsRange
}) {
  const [range, setRange] = useState<PlayerMetricsRange>(defaultRange)
  const [data, setData] = useState<PlayerMetricsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true)
      setError(null)
      try {
        const next = await fetcher<PlayerMetricsResponse>(
          `admin/metrics/players?range=${range}`
        )
        setData(next)
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load player metrics"
        )
        if (!silent) setData(null)
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [range]
  )

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => void refresh(true), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const chartData = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        ts: p.ts,
        players: p.real,
      })),
    [data]
  )

  const empty = !loading && !error && chartData.length === 0
  const chartHeight = compact ? 160 : 280

  return (
    <div
      className={cn(
        "border border-border/80 bg-muted/20",
        compact ? "px-4 py-3" : "px-4 py-4"
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Concurrent players
          </div>
          {!compact ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Real players over time (studio mannequins excluded). Sampled every
              minute while the website is running.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex border border-border/80">
            {RANGES.map((r) => (
              <Button
                key={r.id}
                type="button"
                size="xs"
                variant={range === r.id ? "default" : "ghost"}
                className={cn(
                  "rounded-none border-0",
                  range === r.id ? "" : "text-muted-foreground"
                )}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          {compact ? (
            <Link
              href="/admin/metrics"
              className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
            >
              Open
            </Link>
          ) : (
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={loading}
              onClick={() => void refresh()}
            >
              {loading ? "Loading…" : "Refresh"}
            </Button>
          )}
        </div>
      </div>

      <div className={cn("mt-3 flex flex-wrap gap-x-8 gap-y-3", compact && "mt-2")}>
        <StatCell
          label="Current"
          value={data?.current != null ? String(data.current) : "—"}
        />
        <StatCell
          label="Peak"
          value={data?.peak != null ? String(data.peak) : "—"}
        />
        <StatCell
          label="Average"
          value={
            data?.average != null
              ? Number.isInteger(data.average)
                ? String(data.average)
                : data.average.toFixed(1)
              : "—"
          }
        />
      </div>

      {error ? (
        <div className="mt-3">
          <FormAlert variant="error">{error}</FormAlert>
        </div>
      ) : null}

      <div className="mt-3" style={{ height: chartHeight }}>
        {empty ? (
          <div className="flex h-full items-center justify-center border border-dashed border-border/60 px-4 text-center text-xs text-muted-foreground">
            Collecting samples… the chart fills after a few minutes once the
            website sampler is running.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="playersFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0.35}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="ts"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v: number) => formatTick(v, range)}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                minTickGap={compact ? 48 : 64}
              />
              <YAxis
                allowDecimals={false}
                width={36}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                domain={[0, (max: number) => Math.max(1, Math.ceil(max * 1.1))]}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 0,
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                labelFormatter={(label) =>
                  typeof label === "number"
                    ? formatTooltipTime(label)
                    : String(label)
                }
                formatter={(value) => [
                  typeof value === "number" ? value : String(value ?? "—"),
                  "Players",
                ]}
              />
              <Area
                type="monotone"
                dataKey="players"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#playersFill)"
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 3, fill: "var(--chart-1)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
