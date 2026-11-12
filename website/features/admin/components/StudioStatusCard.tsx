"use client"

import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/kyClient"
import { cn } from "@/lib/utils"

type LiveStatsState = "connected" | "rejected" | "unreachable" | "not_configured"

type WorkerRow = {
  workerId: string
  kind: string
  rendererVersion: number | null
  assetsVersion: string | null
  chrome: string | null
  busy: boolean
  lastSeen: number
  fresh: boolean
  usable: boolean
}

type StudioStatus = {
  liveStats: LiveStatsState
  workerTokenConfigured: boolean
  renderWorker: {
    rendererVersion: number
    online: boolean
    workers: WorkerRow[]
    counts: {
      pending: number
      claimed: number
      ready: number
      failed: number
      total: number
    }
  } | null
  renderWorkerError?: string
  misconfigured: boolean
}

const LIVE_STATS_TEXT: Record<LiveStatsState, string> = {
  connected: "connected",
  unreachable: "not reachable (check the channel is running)",
  rejected: "not connected (the channel refused the website's key)",
  not_configured: "not set up",
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 90) return `${s} s ago`
  const m = Math.round(s / 60)
  if (m < 90) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`
}

async function loadStatus(): Promise<
  { data: StudioStatus; error?: undefined } | { data?: undefined; error: string }
> {
  try {
    const response = await api("admin/studio/status", { timeout: 15_000 })
    const json = (await response.json()) as {
      success?: boolean
      message?: string
      data?: StudioStatus
    }
    if (!response.ok || !json.success || !json.data) {
      return { error: json.message || `HTTP ${response.status}` }
    }
    return { data: json.data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Status load failed" }
  }
}

function StatusRow({
  ok,
  label,
  text,
}: {
  ok: boolean | null
  label: string
  text: string
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <span
        className={cn(
          "inline-block size-2 shrink-0 rounded-full",
          ok === null
            ? "bg-muted-foreground/40"
            : ok
              ? "bg-emerald-500"
              : "bg-red-500"
        )}
        aria-hidden
      />
      <span className="min-w-[8.5rem] text-xs font-medium text-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-xs",
          ok === null && "text-muted-foreground",
          ok === true && "text-emerald-600 dark:text-emerald-400",
          ok === false && "text-red-600 dark:text-red-400"
        )}
      >
        {text}
      </span>
    </li>
  )
}

/**
 * Admin → Portraits: read-only status of live armory stats (channel studio API) and the
 * render worker. Connection settings come from deploy/install.sh; nothing to edit here.
 */
export function StudioStatusCard() {
  const [status, setStatus] = useState<StudioStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const apply = useCallback((result: Awaited<ReturnType<typeof loadStatus>>) => {
    if (result.data) {
      setStatus(result.data)
      setError(null)
    } else {
      setError(result.error)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const tick = () =>
      void loadStatus().then((result) => {
        if (alive) apply(result)
      })
    tick()
    const id = setInterval(tick, 8_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [apply])

  async function refresh() {
    setLoading(true)
    apply(await loadStatus())
    setLoading(false)
  }

  const worker = status?.renderWorker ?? null
  const latest = worker?.workers[0] ?? null
  const counts = worker?.counts

  let workerText = "…"
  if (status) {
    if (!status.workerTokenConfigured) workerText = "not set up"
    else if (status.renderWorkerError) workerText = "status unavailable"
    else if (worker?.online && latest) workerText = `online (last seen ${ago(latest.lastSeen)})`
    else if (latest) workerText = `offline (last seen ${ago(latest.lastSeen)})`
    else workerText = "offline (never seen)"
  }

  return (
    <div className="border border-border bg-card/60 p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium">Status</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <ul className="space-y-1">
        <StatusRow
          label="Live armory stats"
          ok={status ? status.liveStats === "connected" : null}
          text={status ? LIVE_STATS_TEXT[status.liveStats] : "…"}
        />
        <StatusRow
          label="Render worker"
          ok={status ? Boolean(status.workerTokenConfigured && worker?.online) : null}
          text={workerText}
        />
      </ul>

      {status?.misconfigured ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Set by install — re-run deploy/install.sh.
        </p>
      ) : null}

      {counts ? (
        <p className="text-[11px] font-mono text-muted-foreground">
          queue: pending {counts.pending} · claimed {counts.claimed} · ready{" "}
          {counts.ready} · failed {counts.failed}
        </p>
      ) : null}

      {worker && worker.workers.length > 0 ? (
        <details className="text-[11px]">
          <summary className="cursor-pointer text-muted-foreground">
            Worker details
          </summary>
          <div className="mt-1 space-y-0.5">
            {worker.workers.map((w) => (
              <p
                key={w.workerId}
                className={cn(
                  "font-mono",
                  w === latest ? "text-foreground" : "text-muted-foreground"
                )}
              >
                <span className={w.usable ? "text-emerald-500" : "text-amber-500"}>
                  ●
                </span>{" "}
                {w.workerId} · seen {ago(w.lastSeen)} · r{w.rendererVersion ?? "?"}
                {w.rendererVersion !== worker.rendererVersion ? " (mismatch)" : ""} ·
                assets {w.assetsVersion ?? "?"} · {w.busy ? "busy" : "idle"}
                {w.chrome ? ` · ${w.chrome}` : ""}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  )
}
