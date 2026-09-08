"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { useConfirm } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/kyClient"
import { cn } from "@/lib/utils"

type RoleInfo = {
  wid?: string | null
  live?: boolean
  inWorld?: boolean
  screen?: string | null
}

type OrchJob = {
  state?: string
  message?: string
  logTail?: string
  maleOnly?: boolean
  startedAt?: number
  endedAt?: number
  exitCode?: number
}

type AgentStatus = {
  display?: string
  liveWindows?: string[]
  mapped?: Record<string, RoleInfo>
  studioHealth?: Record<string, boolean>
  clientCounts?: { windows?: number; processes?: number; count?: number }
  maxClients?: number
  job?: OrchJob
}

const ROLES = [
  {
    id: "vam1" as const,
    label: "vam1",
    roleClass: "text-sky-400 font-semibold",
    rowClass: "bg-sky-500/[0.04]",
  },
  {
    id: "vaf1" as const,
    label: "vaf1",
    roleClass: "text-pink-400 font-semibold",
    rowClass: "bg-pink-500/[0.04]",
  },
]

function screenLabel(info: RoleInfo | undefined): {
  text: string
  className: string
} {
  if (!info?.live) {
    return { text: "—", className: "text-muted-foreground" }
  }
  const screen = (info.screen || "").toLowerCase()
  if (info.inWorld || screen === "in_world") {
    return { text: "in-world", className: "text-teal-400 font-medium" }
  }
  if (screen === "login") {
    return { text: "login", className: "text-amber-400 font-medium" }
  }
  if (screen === "character_select") {
    return {
      text: "char-select",
      className: "text-cyan-400 font-medium",
    }
  }
  if (screen === "unknown") {
    return { text: "unknown", className: "text-muted-foreground" }
  }
  return {
    text: "not in-world",
    className: "text-amber-500/90 font-medium",
  }
}

export function StudioClientsPanel({
  className,
}: {
  className?: string
} = {}) {
  const confirm = useConfirm()
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [job, setJob] = useState<OrchJob | null>(null)
  const [maleOnly, setMaleOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [killing, setKilling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const refreshJob = useCallback(async () => {
    try {
      const response = await api("admin/studio/clients/job")
      const json = (await response.json()) as {
        success?: boolean
        data?: { job?: OrchJob }
        message?: string
      }
      if (!response.ok || !json.success) return
      const next = json.data?.job ?? null
      setJob(next)
      if (next?.state && next.state !== "running") {
        stopPoll()
      }
    } catch {
      /* ignore */
    }
  }, [stopPoll])

  const refreshStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api("admin/studio/clients/status")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { status?: AgentStatus }
      }
      if (!response.ok || !json.success || !json.data?.status) {
        setError(json.message || `HTTP ${response.status}`)
        setStatus(null)
        return
      }
      setStatus(json.data.status)
      if (json.data.status.job) setJob(json.data.status.job)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status failed")
    } finally {
      setLoading(false)
    }
  }, [])

  const startPoll = useCallback(() => {
    stopPoll()
    pollRef.current = setInterval(() => {
      void refreshJob()
    }, 2500)
  }, [refreshJob, stopPoll])

  useEffect(() => {
    void refreshStatus()
    return () => stopPoll()
  }, [refreshStatus, stopPoll])

  async function startClients() {
    setStarting(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/studio/clients/up", {
        json: { maleOnly },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { job?: OrchJob }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Orch started — watch job log below")
      if (json.data?.job) setJob(json.data.job)
      startPoll()
      void refreshStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Start failed")
    } finally {
      setStarting(false)
    }
  }

  async function killClients() {
    const okConfirm = await confirm({
      title: "Kill Imagine clients?",
      description:
        "Stops game clients on the Wine host (orch down). The preview agent and worker keep running.",
      confirmLabel: "Kill clients",
      variant: "destructive",
    })
    if (!okConfirm) return
    setKilling(true)
    setError(null)
    setOk(null)
    stopPoll()
    try {
      const response = await api.post("admin/studio/clients/down")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Clients stopped")
      await refreshStatus()
      await refreshJob()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kill failed")
    } finally {
      setKilling(false)
    }
  }

  const mapped = status?.mapped ?? {}
  const jobState = job?.state ?? "idle"
  const busy = starting || killing || jobState === "running"
  const liveCount =
    status?.clientCounts?.count ?? (status?.liveWindows || []).length
  const maxClients = status?.maxClients ?? 2
  const wantClients = maleOnly ? 1 : maxClients
  const atCapacity = liveCount > 0
  const canStart = !busy && !atCapacity

  return (
    <div
      className={cn(
        "border border-border bg-card/60 p-4 space-y-4 h-full",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-medium">Clients</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Agent must be up (
            <span className="font-mono text-foreground">./studio up</span>
            ). Cap {maxClients} Imagine clients — Kill before Start if any are
            already running.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || busy}
          onClick={() => void refreshStatus()}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && <FormAlert variant="error">{error}</FormAlert>}
      {ok && <FormAlert variant="success">{ok}</FormAlert>}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={maleOnly}
            disabled={busy}
            onChange={(e) => setMaleOnly(e.target.checked)}
          />
          Male only (vam1)
        </label>
        <Button
          type="button"
          size="sm"
          disabled={!canStart}
          title={
            atCapacity
              ? "Kill existing clients first (refuses to spawn extras)"
              : undefined
          }
          onClick={() => void startClients()}
        >
          {starting || jobState === "running"
            ? "Starting…"
            : `Start clients (≤${wantClients})`}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={starting || killing}
          onClick={() => void killClients()}
        >
          {killing ? "Killing…" : "Kill clients"}
        </Button>
      </div>

      {atCapacity && jobState !== "running" ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {liveCount} client(s) already live — Start disabled until you Kill
          (prevents accidental extra launches).
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-sm border border-border/70">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 bg-muted/30 text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Window</th>
              <th className="px-3 py-2 font-medium">Process</th>
              <th className="px-3 py-2 font-medium">Screen</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((role) => {
              const info = mapped[role.id]
              const screen = screenLabel(info)
              return (
                <tr
                  key={role.id}
                  className={cn(
                    "border-b border-border/40 last:border-0",
                    role.rowClass
                  )}
                >
                  <td className={cn("px-3 py-2.5 font-mono", role.roleClass)}>
                    {role.label}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                    {info?.wid ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {info?.live ? (
                      <span className="text-green-400 font-semibold">live</span>
                    ) : (
                      <span className="text-muted-foreground">missing</span>
                    )}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2.5 font-mono text-xs",
                      screen.className
                    )}
                  >
                    {screen.text}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs space-y-1 font-mono text-muted-foreground">
        <p>
          DISPLAY={status?.display ?? "—"} · live{" "}
          <span className="text-foreground">
            {liveCount}/{maxClients}
          </span>
          {status?.clientCounts
            ? ` (win ${status.clientCounts.windows ?? "?"} / proc ${status.clientCounts.processes ?? "?"})`
            : ""}
        </p>
        <p>
          job: <span className="text-foreground">{jobState}</span>
          {job?.message ? ` — ${job.message}` : ""}
        </p>
      </div>

      {job?.logTail ? (
        <pre className="text-[11px] leading-snug max-h-56 overflow-auto border border-border/60 bg-background/50 p-2 whitespace-pre-wrap font-mono">
          {job.logTail}
        </pre>
      ) : null}
    </div>
  )
}
