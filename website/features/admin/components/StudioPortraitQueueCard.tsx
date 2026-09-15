"use client"

import { useCallback, useEffect, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { useConfirm } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/kyClient"
import { cn } from "@/lib/utils"

type QueueJob = {
  fingerprint: string
  characterName: string
  status: string
  error: string | null
  createdAt: number
  updatedAt: number
  claimedAt: number | null
}

type QueueCounts = {
  pending: number
  claimed: number
  ready: number
  failed: number
  total: number
}

/** Admin: inspect portrait queue, enqueue one, or bulk fill missing / force all. */
export function StudioPortraitQueueCard() {
  const confirm = useConfirm()
  const [jobs, setJobs] = useState<QueueJob[]>([])
  const [counts, setCounts] = useState<QueueCounts | null>(null)
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const response = await api("admin/studio/portraits/queue", {
        timeout: 30_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { jobs?: QueueJob[]; counts?: QueueCounts }
      }
      if (!response.ok || !json.success) {
        if (!opts?.silent) {
          setError(json.message || `HTTP ${response.status}`)
        }
        return
      }
      setJobs(json.data?.jobs ?? [])
      setCounts(json.data?.counts ?? null)
    } catch (err) {
      if (!opts?.silent) {
        setError(err instanceof Error ? err.message : "Queue load failed")
      }
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh({ silent: true })
    const id = setInterval(() => void refresh({ silent: true }), 8_000)
    return () => clearInterval(id)
  }, [refresh])

  async function enqueueOne(force: boolean) {
    const trimmed = name.trim()
    if (!trimmed) return
    if (force) {
      const okConfirm = await confirm({
        title: `Force re-queue ${trimmed}?`,
        description:
          "Deletes any existing portrait PNG and queue row, then enqueues a fresh capture.",
        confirmLabel: "Force queue",
        variant: "destructive",
      })
      if (!okConfirm) return
    }
    setBusy(force ? "force-one" : "add")
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/studio/portraits/queue", {
        json: { name: trimmed, force },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { counts?: QueueCounts }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Queued")
      if (json.data?.counts) setCounts(json.data.counts)
      await refresh({ silent: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enqueue failed")
    } finally {
      setBusy(null)
    }
  }

  async function bulk(mode: "missing" | "force") {
    const okConfirm = await confirm({
      title:
        mode === "force"
          ? "Force re-portrait every public character?"
          : "Queue portraits for all missing characters?",
      description:
        mode === "force"
          ? "Clears existing PNGs and re-queues every public character except vam/vaf mannequins. Worker must be running with Process queue on."
          : "Scans the world DB (excluding vam/vaf) and enqueues anyone without a cached portrait. Already-queued jobs are left alone.",
      confirmLabel: mode === "force" ? "Force all" : "Queue missing",
      variant: mode === "force" ? "destructive" : "default",
    })
    if (!okConfirm) return

    setBusy(mode)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/studio/portraits/queue/bulk", {
        json: { mode },
        timeout: 120_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: {
          counts?: QueueCounts
          bulk?: {
            scanned?: number
            enqueued?: number
            forced?: number
            skipped?: number
          }
        }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Bulk done")
      if (json.data?.counts) setCounts(json.data.counts)
      await refresh({ silent: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk failed")
    } finally {
      setBusy(null)
    }
  }

  const pendingish = (counts?.pending ?? 0) + (counts?.claimed ?? 0)
  const disabled = Boolean(busy)

  return (
    <div className="border border-border bg-card/60 p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Portrait queue</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Inspect pending captures, enqueue one character, or bulk-fill
            everyone except vam/vaf. Turn{" "}
            <span className="font-medium text-foreground">Process queue</span>{" "}
            on when mannequins are ready.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || disabled}
          onClick={() => void refresh()}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {counts ? (
        <p className="text-[11px] font-mono text-muted-foreground">
          pending {counts.pending} · claimed {counts.claimed} · ready{" "}
          {counts.ready} · failed {counts.failed}
          {pendingish > 0 ? (
            <span className="text-teal-400"> · {pendingish} in flight</span>
          ) : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <Field className="gap-1 min-w-[10rem] flex-1">
          <FieldLabel htmlFor="studio-portrait-queue-name" className="text-[11px]">
            Add character
          </FieldLabel>
          <Input
            id="studio-portrait-queue-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="catm"
            autoComplete="off"
            className="h-8 text-xs font-mono"
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void enqueueOne(false)
              }
            }}
          />
        </Field>
        <Button
          type="button"
          size="sm"
          disabled={disabled || !name.trim()}
          onClick={() => void enqueueOne(false)}
        >
          {busy === "add" ? "Adding…" : "Add to queue"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || !name.trim()}
          onClick={() => void enqueueOne(true)}
        >
          {busy === "force-one" ? "…" : "Force"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => void bulk("missing")}
        >
          {busy === "missing" ? "Scanning…" : "Queue all missing"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          title="Clears existing portraits and re-queues every public character"
          onClick={() => void bulk("force")}
        >
          {busy === "force" ? "Force…" : "Force all characters"}
        </Button>
      </div>

      {error && <FormAlert variant="error">{error}</FormAlert>}
      {ok && <FormAlert variant="success">{ok}</FormAlert>}

      <div className="max-h-56 overflow-auto rounded-sm border border-border/70">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/70 bg-muted/30 text-left text-muted-foreground">
              <th className="px-2 py-1.5 font-medium">Char</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5 font-medium">Fingerprint</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-2 py-3 text-muted-foreground text-center"
                >
                  Queue empty
                </td>
              </tr>
            ) : (
              [...jobs]
                .sort((a, b) => {
                  const order = { claimed: 0, pending: 1, failed: 2, ready: 3 }
                  const ao =
                    order[a.status as keyof typeof order] ?? 9
                  const bo =
                    order[b.status as keyof typeof order] ?? 9
                  if (ao !== bo) return ao - bo
                  return b.updatedAt - a.updatedAt
                })
                .slice(0, 80)
                .map((job) => (
                  <tr
                    key={job.fingerprint}
                    className="border-b border-border/40 last:border-0"
                  >
                    <td className="px-2 py-1.5 font-mono">{job.characterName}</td>
                    <td
                      className={cn(
                        "px-2 py-1.5 font-mono",
                        job.status === "pending" && "text-amber-400",
                        job.status === "claimed" && "text-sky-400",
                        job.status === "ready" && "text-teal-400",
                        job.status === "failed" && "text-red-400"
                      )}
                    >
                      {job.status}
                      {job.error ? (
                        <span
                          className="block max-w-[14rem] truncate text-[10px] text-muted-foreground"
                          title={job.error}
                        >
                          {job.error}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">
                      {job.fingerprint.slice(0, 8)}…
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
