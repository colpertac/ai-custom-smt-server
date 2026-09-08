"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  KeyRound,
  LogIn,
  Play,
  RotateCcw,
  Square,
  Gamepad2,
} from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { useConfirm } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  displayError?: string
  workerAlive?: boolean
  workerPid?: number | null
  watchdogAlive?: boolean
  liveWindows?: string[]
  mapped?: Record<string, RoleInfo>
  studioHealth?: Record<string, boolean>
  clientCounts?: { windows?: number; processes?: number; count?: number }
  maxClients?: number
  job?: OrchJob
  loginJob?: OrchJob & { role?: string; step?: string }
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
  // Snap classification is authoritative (channel health can lag after kick).
  if (screen === "server_down") {
    return { text: "server-down", className: "text-red-400 font-semibold" }
  }
  if (screen === "black") {
    return { text: "black", className: "text-zinc-300 font-medium" }
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
  if (screen === "in_world") {
    return { text: "in-world", className: "text-teal-400 font-medium" }
  }
  if (screen === "unknown") {
    return { text: "unknown", className: "text-muted-foreground" }
  }
  if (info.inWorld) {
    return { text: "in-world?", className: "text-teal-400/70 font-medium" }
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
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [killing, setKilling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const jobWasRunning = useRef(false)
  const inFlight = useRef(false)

  const [stepBusy, setStepBusy] = useState<string | null>(null)
  const [loginJob, setLoginJob] = useState<
    (OrchJob & { role?: string; step?: string }) | null
  >(null)

  const refreshStatus = useCallback(async (opts?: { silent?: boolean }) => {
    if (inFlight.current && opts?.silent) return
    const silent = Boolean(opts?.silent)
    inFlight.current = true
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const response = await api("admin/studio/clients/status", {
        timeout: 45_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { status?: AgentStatus }
      }
      if (!response.ok || !json.success || !json.data?.status) {
        if (!silent) {
          setError(json.message || `HTTP ${response.status}`)
          setStatus(null)
        }
        return
      }
      setStatus(json.data.status)
      if (json.data.status.job) setJob(json.data.status.job)
      if (json.data.status.loginJob) setLoginJob(json.data.status.loginJob)
      if (json.data.status.displayError && !silent) {
        setError(`Display: ${json.data.status.displayError}`)
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Status failed")
      }
    } finally {
      inFlight.current = false
      if (!silent) setLoading(false)
    }
  }, [])

  // Auto-poll: faster while orch/login step is running, idle cadence otherwise.
  useEffect(() => {
    void refreshStatus({ silent: true })
    const tick = () => {
      void refreshStatus({ silent: true })
    }
    const running =
      job?.state === "running" || loginJob?.state === "running"
    if (running) jobWasRunning.current = true
    if (!running && jobWasRunning.current) {
      jobWasRunning.current = false
      void refreshStatus({ silent: true })
      setStepBusy(null)
    }
    const ms = running ? 2500 : 5000
    pollRef.current = setInterval(tick, ms)
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [refreshStatus, job?.state, loginJob?.state])

  async function startClients() {
    setStarting(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/studio/clients/up", {
        json: {},
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
      setOk(json.message || "Orch started — table updates automatically")
      if (json.data?.job) {
        setJob(json.data.job)
        jobWasRunning.current = true
      }
      void refreshStatus({ silent: true })
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
      await refreshStatus({ silent: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kill failed")
    } finally {
      setKilling(false)
    }
  }

  async function runLoginStep(
    role: "vam1" | "vaf1",
    step: "login" | "credentials" | "start" | "full"
  ) {
    const key = `step:${role}:${step}`
    setStepBusy(key)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/studio/clients/login", {
        json: { role, step },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { loginJob?: OrchJob & { role?: string; step?: string } }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        setStepBusy(null)
        return
      }
      setOk(json.message || `${role} ${step} started`)
      if (json.data?.loginJob) {
        setLoginJob(json.data.loginJob)
        jobWasRunning.current = true
      }
      void refreshStatus({ silent: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login step failed")
      setStepBusy(null)
    }
  }

  async function runClientAction(
    role: "vam1" | "vaf1",
    action: "start" | "stop" | "restart"
  ) {
    const key = `action:${role}:${action}`
    setStepBusy(key)
    setError(null)
    setOk(null)
    try {
      if (action === "stop" || action === "restart") {
        const okConfirm = await confirm({
          title:
            action === "restart"
              ? `Restart ${role}?`
              : `Stop ${role}?`,
          description:
            action === "restart"
              ? `Kills ${role}'s Imagine window, then launches + logs in again. The other role is left alone.`
              : `Kills only ${role}'s Imagine window. The other role keeps running.`,
          confirmLabel: action === "restart" ? "Restart" : "Stop",
          variant: "destructive",
        })
        if (!okConfirm) {
          setStepBusy(null)
          return
        }
      }
      const response = await api.post("admin/studio/clients/action", {
        json: { role, action },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: {
          job?: OrchJob
          loginJob?: OrchJob
        }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        setStepBusy(null)
        return
      }
      setOk(json.message || `${action} ${role}`)
      if (json.data?.job) {
        setJob(json.data.job)
        jobWasRunning.current = true
      }
      void refreshStatus({ silent: true })
      if (action === "stop") setStepBusy(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Client action failed")
      setStepBusy(null)
    }
  }

  const mapped = status?.mapped ?? {}
  const jobState = job?.state ?? "idle"
  const orchRunning = jobState === "running"
  const loginRunning = loginJob?.state === "running"
  const busy = starting || killing || orchRunning || loginRunning
  const liveCount =
    status?.clientCounts?.count ?? (status?.liveWindows || []).length
  const maxClients = status?.maxClients ?? 2
  const atCapacity = liveCount >= maxClients
  const dualAtCapacity = liveCount > 0
  const canStart = !busy && !dualAtCapacity

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
            ). Dual Start needs zero live windows; per-role Play can fill an
            empty slot. Black / stuck login → Restart. Watchdog auto-relogs in
            place (creds + Start Game, not a full Restart) a few times when
            offline + login screen — then Discords. Stop/Restart stay available
            on a live window. Status auto-refreshes
            {orchRunning ? " (every ~2.5s while starting)" : " (~5s)"}.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || killing}
          onClick={() => void refreshStatus()}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && <FormAlert variant="error">{error}</FormAlert>}
      {ok && <FormAlert variant="success">{ok}</FormAlert>}
      {status && status.workerAlive === false ? (
        <FormAlert variant="error">
          Portrait worker is stopped — armory captures will sit pending. Preview
          agent should auto-respawn it; or on the Wine host run{" "}
          <span className="font-mono">./studio up</span>.
        </FormAlert>
      ) : null}
      {status?.workerAlive ? (
        <p className="text-[11px] text-muted-foreground font-mono">
          worker pid {status.workerPid ?? "?"}
          {status.watchdogAlive === false ? " · watchdog stopped" : ""}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={!canStart}
          title={
            dualAtCapacity
              ? "Kill all or use per-role Play on an empty slot"
              : undefined
          }
          onClick={() => void startClients()}
        >
          {starting || orchRunning
            ? "Starting…"
            : `Start clients (≤${maxClients})`}
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

      {atCapacity && !orchRunning ? (
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
              <th className="px-3 py-2 font-medium">Channel</th>
              <th className="px-3 py-2 font-medium">
                <TooltipProvider delay={150}>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
                      Screen
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      Heuristic / OCR estimate from a screenshot — can be wrong
                      (e.g. red clothes vs disconnect). Use Resume from what
                      you see in the Snap, not this label alone.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </th>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Resume</th>
            </tr>
          </thead>
          <tbody>
            {ROLES.map((role) => {
              const info = mapped[role.id]
              const screen = screenLabel(info)
              const channelOnline = Boolean(
                status?.studioHealth?.[role.id] ||
                  (role.id === "vam1" &&
                    (status?.studioHealth?.vam || status?.studioHealth?.va)) ||
                  (role.id === "vaf1" && status?.studioHealth?.vaf)
              )
              const live = Boolean(info?.live)
              const iconBtn =
                "h-7 w-7 p-0 shrink-0 [&_svg]:size-3.5"
              const canAct = !busy
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
                    {live ? (
                      <span className="text-green-400 font-semibold">live</span>
                    ) : (
                      <span className="text-muted-foreground">missing</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {channelOnline ? (
                      <span className="text-teal-400/80">online</span>
                    ) : (
                      <span className="text-muted-foreground">offline</span>
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
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={iconBtn}
                        disabled={!canAct || live || atCapacity}
                        title={`Start ${role.id} (launch + login)`}
                        onClick={() => void runClientAction(role.id, "start")}
                      >
                        {stepBusy === `action:${role.id}:start` ? (
                          "…"
                        ) : (
                          <Play aria-hidden />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={iconBtn}
                        disabled={!live || stepBusy === `action:${role.id}:stop`}
                        title={`Stop ${role.id}`}
                        onClick={() => void runClientAction(role.id, "stop")}
                      >
                        {stepBusy === `action:${role.id}:stop` ? (
                          "…"
                        ) : (
                          <Square aria-hidden />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={iconBtn}
                        disabled={
                          !live || stepBusy === `action:${role.id}:restart`
                        }
                        title={`Restart ${role.id} (black / hung / stuck login)`}
                        onClick={() =>
                          void runClientAction(role.id, "restart")
                        }
                      >
                        {stepBusy === `action:${role.id}:restart` ? (
                          "…"
                        ) : (
                          <RotateCcw aria-hidden />
                        )}
                      </Button>
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-0.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={iconBtn}
                        disabled={!live}
                        title="Resume: already on login — skip splash, creds + Start Game"
                        onClick={() => void runLoginStep(role.id, "login")}
                      >
                        {stepBusy === `step:${role.id}:login` ? (
                          "…"
                        ) : (
                          <LogIn aria-hidden />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={iconBtn}
                        disabled={!live}
                        title="Resume: credentials only"
                        onClick={() =>
                          void runLoginStep(role.id, "credentials")
                        }
                      >
                        {stepBusy === `step:${role.id}:credentials` ? (
                          "…"
                        ) : (
                          <KeyRound aria-hidden />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={iconBtn}
                        disabled={!live}
                        title="Resume: Start Game (char select)"
                        onClick={() => void runLoginStep(role.id, "start")}
                      >
                        {stepBusy === `step:${role.id}:start` ? (
                          "…"
                        ) : (
                          <Gamepad2 aria-hidden />
                        )}
                      </Button>
                    </div>
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
          {loginJob?.state && loginJob.state !== "idle" ? (
            <>
              {" · "}
              login:{" "}
              <span className="text-foreground">
                {loginJob.role ?? "?"} {loginJob.step ?? ""} ({loginJob.state})
              </span>
              {loginJob.message ? ` — ${loginJob.message}` : ""}
            </>
          ) : null}
        </p>
      </div>

      {(job?.logTail || loginJob?.logTail) ? (
        <pre className="text-[11px] leading-snug max-h-56 overflow-auto border border-border/60 bg-background/50 p-2 whitespace-pre-wrap font-mono">
          {loginJob?.state === "running" ||
          (loginJob?.endedAt &&
            (!job?.endedAt || (loginJob.endedAt ?? 0) >= (job.endedAt ?? 0)))
            ? loginJob?.logTail || job?.logTail
            : job?.logTail || loginJob?.logTail}
        </pre>
      ) : null}
    </div>
  )
}
