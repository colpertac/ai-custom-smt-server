"use client"

import { useCallback, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/kyClient"
import { cn } from "@/lib/utils"

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

type RenderWorkerStatus = {
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
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 90) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 90) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}

async function loadStatus(): Promise<
  { data: RenderWorkerStatus; error?: undefined } | { data?: undefined; error: string }
> {
  try {
    const response = await api("admin/studio/render-worker", {
      timeout: 15_000,
    })
    const json = (await response.json()) as {
      success?: boolean
      message?: string
      data?: RenderWorkerStatus
    }
    if (!response.ok || !json.success || !json.data) {
      return { error: json.message || `HTTP ${response.status}` }
    }
    return { data: json.data }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Status load failed" }
  }
}

/** Admin: three.js render worker heartbeat + queue counts. */
export function StudioRenderWorkerCard() {
  const [status, setStatus] = useState<RenderWorkerStatus | null>(null)
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

  const latest = status?.workers[0] ?? null
  const counts = status?.counts

  return (
    <div className="border border-border bg-card/60 p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">
            Render worker{" "}
            <span
              className={cn(
                "ml-1 font-mono text-[11px]",
                status?.online ? "text-teal-400" : "text-amber-400"
              )}
            >
              {status ? (status.online ? "online" : "offline") : "…"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Armory portraits come from the three.js render worker
            (avatar/worker). Online = heartbeat on renderer v
            {status?.rendererVersion ?? "?"} in the last 60 s.
          </p>
        </div>
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

      {status && status.workers.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No heartbeat yet. Start avatar/worker with PORTRAIT_QUEUE_URL and
          PORTRAIT_WORKER_TOKEN.
        </p>
      ) : null}

      {status?.workers.map((w) => (
        <p
          key={w.workerId}
          className={cn(
            "text-[11px] font-mono",
            w === latest ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <span className={w.usable ? "text-teal-400" : "text-amber-400"}>●</span>{" "}
          {w.workerId} · seen {ago(w.lastSeen)} · r{w.rendererVersion ?? "?"}
          {w.rendererVersion !== status.rendererVersion ? " (mismatch)" : ""} ·
          assets {w.assetsVersion ?? "?"} · {w.busy ? "busy" : "idle"}
          {w.chrome ? ` · ${w.chrome}` : ""}
        </p>
      ))}

      {counts ? (
        <p className="text-[11px] font-mono text-muted-foreground">
          queue: pending {counts.pending} · claimed {counts.claimed} · ready{" "}
          {counts.ready} · failed {counts.failed}
        </p>
      ) : null}
    </div>
  )
}
