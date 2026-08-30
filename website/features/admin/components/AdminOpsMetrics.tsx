"use client"

import { useCallback, useEffect, useState } from "react"

import { api } from "@/lib/kyClient"

type LiveMetrics = {
  ok?: boolean
  backend?: string | null
  error?: string
  players?: {
    total: number
    worlds: { worldId: number; characterCount: number }[]
    error?: string
  }
  host?: {
    cpuPercent?: number | null
    memUsedBytes?: number | null
    memTotalBytes?: number | null
    memAvailableBytes?: number | null
  } | null
  processes?: {
    name: string
    running: boolean
    pid?: number | null
    rssBytes?: number | null
    cpuPercent?: number | null
  }[]
}

const POLL_MS = 4000

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  const gb = n / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GiB`
  const mb = n / (1024 * 1024)
  return `${mb.toFixed(0)} MiB`
}

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—"
  return `${n.toFixed(1)}%`
}

function MetricCell({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="min-w-[6.5rem]">
      <div className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-lg tabular-nums text-foreground">
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[0.65rem] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  )
}

export function AdminOpsMetrics() {
  const [live, setLive] = useState<LiveMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await api("admin/ops/metrics")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: LiveMetrics
      }
      if (!response.ok || !json.success || !json.data) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setLive(json.data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "metrics failed")
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const players = live?.players
  const host = live?.host
  const memHint =
    host?.memTotalBytes != null
      ? `${formatBytes(host.memUsedBytes)} / ${formatBytes(host.memTotalBytes)}`
      : undefined
  const memPct =
    host?.memUsedBytes != null &&
    host?.memTotalBytes != null &&
    host.memTotalBytes > 0
      ? formatPct((100 * host.memUsedBytes) / host.memTotalBytes)
      : "—"

  const worldHint =
    players?.worlds?.length && !players.error
      ? players.worlds
          .map((w) => `w${w.worldId}:${w.characterCount}`)
          .join(" · ")
      : players?.error
        ? players.error
        : undefined

  return (
    <div className="mt-5 border border-border/80 bg-muted/20 px-4 py-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Live
          {live?.backend ? (
            <span className="ml-2 font-normal normal-case tracking-normal">
              ({live.backend})
            </span>
          ) : null}
        </div>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : live?.error && !live.ok ? (
          <p className="text-xs text-muted-foreground">{live.error}</p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-4">
        <MetricCell
          label="Players"
          value={
            players && !players.error ? String(players.total) : "—"
          }
          hint={worldHint}
        />
        <MetricCell
          label="CPU"
          value={formatPct(host?.cpuPercent)}
          hint="host"
        />
        <MetricCell label="RAM" value={memPct} hint={memHint} />
        {(live?.processes ?? []).map((proc) => (
          <MetricCell
            key={proc.name}
            label={proc.name}
            value={proc.running ? "up" : "down"}
            hint={
              proc.running
                ? [
                    proc.cpuPercent != null
                      ? `cpu ${formatPct(proc.cpuPercent)}`
                      : null,
                    proc.rssBytes != null
                      ? `rss ${formatBytes(proc.rssBytes)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                : undefined
            }
          />
        ))}
      </div>
    </div>
  )
}
