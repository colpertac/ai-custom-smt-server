"use client"

import { useCallback, useEffect, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { AdminOpsMetrics } from "@/features/admin/components/AdminOpsMetrics"
import { AdminServiceStatus } from "@/features/admin/components/AdminServiceStatus"
import {
  notifyLaneAPendingChanged,
  useLaneAPending,
} from "@/features/admin/lane-a-pending"
import { api } from "@/lib/kyClient"
import { cn } from "@/lib/utils"

type OpsHealth = {
  ok: boolean
  service?: string
  backend?: string
  verbs?: string[]
  error?: string
  channelStale?: boolean
  lastContentChangeAt?: string | null
  lastContentKinds?: string[]
  lastContentSource?: string | null
  lastChannelRestartAt?: string | null
  overlayStale?: boolean
  lastOverlayRehashAt?: string | null
  firstBoot?: {
    needed?: boolean
    ready?: boolean
    missing?: string[]
  }
}

type OpsActionResponse = {
  success?: boolean
  message?: string
  data?: {
    backend?: string
    detail?: string
    warnings?: string[]
    errors?: string[]
    shopsCopied?: number
    payoutsPackaged?: number
    reportRewardsPackaged?: number
    releaseId?: string
    phase?: string
    restarted?: boolean
    clientOverlayUpdated?: boolean
  }
}

type PublishPhase =
  "idle" | "validating" | "applying" | "restarting" | "done" | "failed"

function phaseLabel(phase: PublishPhase): string | null {
  switch (phase) {
    case "validating":
      return "Validating shops, payouts & report rewards…"
    case "applying":
      return "Validation passed — copying to the live server…"
    case "restarting":
      return "Copied — restarting the game channel…"
    default:
      return null
  }
}

function formatOpsStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  })
}

function channelStaleMessage(health: OpsHealth): string | null {
  if (!health.channelStale || !health.lastContentChangeAt) return null
  const when = formatOpsStamp(health.lastContentChangeAt)
  const kinds = health.lastContentKinds?.length
    ? ` (${health.lastContentKinds.join(", ")})`
    : ""
  return `New files were uploaded on ${when}${kinds}. The game channel is still running older data — restart the game channel when you are ready.`
}

function overlayStaleMessage(health: OpsHealth): string | null {
  if (!health.overlayStale) return null
  return "Updater files changed but the download list was not refreshed. Use Refresh updater list under Game files so players can download the new files."
}

function backendLabel(backend?: string): string {
  if (backend === "docker") return "Docker"
  return "This PC"
}

export function AdminOpsHealth() {
  const [health, setHealth] = useState<OpsHealth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [restartingAll, setRestartingAll] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle")
  const [lastReleaseId, setLastReleaseId] = useState<string | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [stopOpen, setStopOpen] = useState(false)
  const [restartAllOpen, setRestartAllOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishWithRestart, setPublishWithRestart] = useState(true)
  const [checking, setChecking] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [laneCOpen, setLaneCOpen] = useState(false)
  const [laneCBusy, setLaneCBusy] = useState(false)
  const [laneCIncludeWebsite, setLaneCIncludeWebsite] = useState(false)
  const [retiringConflicts, setRetiringConflicts] = useState(false)
  const laneAPending = useLaneAPending()
  const showRetireConflicts =
    !!error &&
    /blocked by another live package|DropSet or event ID conflict|retire packages/i.test(
      error
    )

  const refresh = useCallback(async () => {
    setPending(true)
    setError(null)
    try {
      const response = await api("admin/ops/health")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: OpsHealth
      }
      if (!response.ok || !json.success || !json.data) {
        setHealth(null)
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setHealth(json.data)
      if (!json.data.ok) {
        setError(json.data.error || "Server control is not responding")
        return
      }
      setError(null)
    } catch (e) {
      setHealth(null)
      setError(
        e instanceof Error ? e.message : "Could not reach server control"
      )
    } finally {
      setPending(false)
    }
  }, [])

  const runOpsAction = useCallback(
    async (
      path: "admin/ops/start" | "admin/ops/stop" | "admin/ops/restart/services",
      fallbackOk: string,
      setBusy: (v: boolean) => void,
      closeDialog: () => void
    ) => {
      closeDialog()
      setBusy(true)
      setError(null)
      setOk(null)
      try {
        const response = await api.post(path, { timeout: 180_000 })
        const json = (await response.json()) as OpsActionResponse
        if (!response.ok || !json.success) {
          setError(json.message || `HTTP ${response.status}`)
          return
        }
        setOk(json.message || fallbackOk)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "request failed")
      } finally {
        setBusy(false)
      }
    },
    [refresh]
  )

  const startServers = useCallback(async () => {
    await runOpsAction(
      "admin/ops/start",
      "All services started",
      setStarting,
      () => setStartOpen(false)
    )
  }, [runOpsAction])

  const stopServers = useCallback(async () => {
    await runOpsAction(
      "admin/ops/stop",
      "All services stopped",
      setStopping,
      () => setStopOpen(false)
    )
  }, [runOpsAction])

  const restartAllServices = useCallback(async () => {
    await runOpsAction(
      "admin/ops/restart/services",
      "All services restarted",
      setRestartingAll,
      () => setRestartAllOpen(false)
    )
  }, [runOpsAction])

  const publishLaneA = useCallback(async (restart: boolean) => {
    setPublishOpen(false)
    setError(null)
    setOk(null)
    setPublishPhase("validating")
    try {
      const validateRes = await api.post("admin/ops/publish/lane-a/validate")
      const validateJson = (await validateRes.json()) as OpsActionResponse
      if (!validateRes.ok || !validateJson.success || !validateJson.data) {
        setPublishPhase("failed")
        const errs = validateJson.data?.errors
        setError(
          errs?.length
            ? errs.join("; ")
            : validateJson.message || `HTTP ${validateRes.status}`
        )
        return
      }

      const releaseId = validateJson.data.releaseId
      if (!releaseId) {
        setPublishPhase("failed")
        setError("Validation passed but no publish id came back")
        return
      }
      setLastReleaseId(releaseId)

      const warn = validateJson.data.warnings
      setPublishPhase("applying")
      const applyRes = await api.post("admin/ops/publish/lane-a/apply", {
        json: { releaseId, restart: false },
      })
      const applyJson = (await applyRes.json()) as OpsActionResponse
      if (!applyRes.ok || !applyJson.success) {
        setPublishPhase("failed")
        setError(applyJson.message || `HTTP ${applyRes.status}`)
        return
      }

      if (restart) {
        setPublishPhase("restarting")
        const restartRes = await api.post("admin/ops/restart/channel")
        const restartJson = (await restartRes.json()) as OpsActionResponse
        if (!restartRes.ok || !restartJson.success) {
          setPublishPhase("failed")
          setError(
            restartJson.message ||
              "Shops were copied but the game channel did not restart — use Restart on the Channel row under Power"
          )
          return
        }
      }

      setPublishPhase("done")
      const parts = [
        restart
          ? "Game content published; channel restarted"
          : "Game content published — restart the game channel when you want players to see it",
        applyJson.data?.shopsCopied != null
          ? `${applyJson.data.shopsCopied} shop(s)`
          : null,
        applyJson.data?.payoutsPackaged != null
          ? `${applyJson.data.payoutsPackaged} payout pack(s)`
          : null,
        applyJson.data?.reportRewardsPackaged != null
          ? `${applyJson.data.reportRewardsPackaged} report-reward pack(s)`
          : null,
        applyJson.data?.clientOverlayUpdated
          ? "client dialog overlay updated — players must run ImagineUpdate"
          : null,
      ].filter(Boolean)
      const base = parts.join(" — ")
      setOk(warn?.length ? `${base} (${warn.join(" ")})` : base)
      notifyLaneAPendingChanged()
      await refresh()
    } catch (e) {
      setPublishPhase("failed")
      setError(e instanceof Error ? e.message : "Publish failed")
    } finally {
      setTimeout(() => {
        setPublishPhase((p) => (p === "done" || p === "failed" ? "idle" : p))
      }, 800)
    }
  }, [refresh])

  const openPublishDialog = useCallback((restart: boolean) => {
    setPublishWithRestart(restart)
    setPublishOpen(true)
  }, [])

  const checkLaneA = useCallback(async () => {
    setError(null)
    setOk(null)
    setChecking(true)
    try {
      const validateRes = await api.post("admin/ops/publish/lane-a/validate", {
        timeout: 120_000,
      })
      const validateJson = (await validateRes.json()) as OpsActionResponse
      if (!validateRes.ok || !validateJson.success || !validateJson.data) {
        const errs = validateJson.data?.errors
        setError(
          errs?.length
            ? errs.join("; ")
            : validateJson.message || `HTTP ${validateRes.status}`
        )
        return
      }
      if (validateJson.data.releaseId) {
        setLastReleaseId(validateJson.data.releaseId)
      }
      const warn = validateJson.data.warnings
      const parts = [
        "Shops & payouts validation passed (live server unchanged)",
        validateJson.data.shopsCopied != null
          ? `${validateJson.data.shopsCopied} shop(s)`
          : null,
        validateJson.data.payoutsPackaged != null
          ? `${validateJson.data.payoutsPackaged} payout pack(s)`
          : null,
        validateJson.data.reportRewardsPackaged != null
          ? `${validateJson.data.reportRewardsPackaged} report-reward pack(s)`
          : null,
        validateJson.data.releaseId
          ? `release ${validateJson.data.releaseId}`
          : null,
      ].filter(Boolean)
      const base = parts.join(" — ")
      setOk(warn?.length ? `${base} (${warn.join(" ")})` : base)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validate failed")
    } finally {
      setChecking(false)
    }
  }, [])

  const rollbackLaneA = useCallback(async () => {
    setRollbackOpen(false)
    setRollingBack(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/ops/publish/lane-a/rollback", {
        json: {
          releaseId: lastReleaseId ?? undefined,
          restart: true,
        },
      })
      const json = (await response.json()) as OpsActionResponse
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Last publish undone; game channel restarted")
      notifyLaneAPendingChanged()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Undo failed")
    } finally {
      setRollingBack(false)
    }
  }, [lastReleaseId, refresh])

  const publishLaneC = useCallback(async () => {
    setLaneCOpen(false)
    setLaneCBusy(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/ops/publish/lane-c", {
        json: {
          confirm: true,
          includeWebsite: laneCIncludeWebsite,
        },
        timeout: 600_000,
      })
      const json = (await response.json()) as OpsActionResponse & {
        data?: { services?: string[] }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      const services = json.data?.services?.length
        ? json.data.services.join(", ")
        : null
      setOk(
        [
          json.message || "Game servers updated",
          services ? `(${services})` : null,
        ]
          .filter(Boolean)
          .join(" ")
      )
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed")
    } finally {
      setLaneCBusy(false)
    }
  }, [laneCIncludeWebsite, refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onFreshness = () => {
      void refresh()
    }
    window.addEventListener("ops-freshness-changed", onFreshness)
    return () => {
      window.removeEventListener("ops-freshness-changed", onFreshness)
    }
  }, [refresh])

  const controlOk = Boolean(health?.ok)
  const firstBootBlocked = Boolean(health?.firstBoot?.needed)
  const staleText = health ? channelStaleMessage(health) : null
  const overlayText = health ? overlayStaleMessage(health) : null
  const publishing =
    publishPhase === "validating" ||
    publishPhase === "applying" ||
    publishPhase === "restarting"
  const busy =
    pending ||
    starting ||
    stopping ||
    restartingAll ||
    publishing ||
    checking ||
    rollingBack ||
    laneCBusy
  const progressText = phaseLabel(publishPhase)
  const dockerBackend = health?.backend === "docker"

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Server control
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Start and stop the game, publish shops / payouts / report rewards, or
            update
            server software.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {pending ? "Refreshing…" : "Refresh status"}
        </Button>
      </div>

      <AdminOpsMetrics />

      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {showRetireConflicts ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={retiringConflicts || pending}
            onClick={() => {
              void (async () => {
                setRetiringConflicts(true)
                setOk(null)
                try {
                  const res = await api.post("admin/payouts/conflicts")
                  const json = (await res.json()) as {
                    success?: boolean
                    message?: string
                    data?: { retired?: string[]; skipped?: string[] }
                  }
                  if (!res.ok || !json.success) {
                    setError(json.message || `HTTP ${res.status}`)
                    return
                  }
                  const retired = json.data?.retired ?? []
                  setError(null)
                  setOk(
                    retired.length
                      ? `Retired ${retired.join(", ")}. Run Validate, then Publish & restart.`
                      : json.message ||
                          "No blocking packages left. Run Validate again."
                  )
                  notifyLaneAPendingChanged()
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Failed to retire packages"
                  )
                } finally {
                  setRetiringConflicts(false)
                }
              })()
            }}
          >
            {retiringConflicts ? "Retiring…" : "Retire blocking packages"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Renames conflicting live zips so payout publish can own those IDs.
          </span>
        </div>
      ) : null}
      {firstBootBlocked ? (
        <FormAlert variant="warning">
          First-time setup is not finished — upload character art data
          (BinaryData) and zone maps before starting servers.
        </FormAlert>
      ) : null}
      {staleText ? <FormAlert variant="warning">{staleText}</FormAlert> : null}
      {overlayText ? (
        <FormAlert variant="warning">{overlayText}</FormAlert>
      ) : null}
      {progressText ? (
        <FormAlert variant="success">{progressText}</FormAlert>
      ) : null}
      {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}
      {controlOk &&
      !error &&
      !ok &&
      !progressText &&
      !staleText &&
      !overlayText &&
      !firstBootBlocked ? (
        <FormAlert variant="success">
          Server control is online ({backendLabel(health?.backend)}).
        </FormAlert>
      ) : null}

      <div className="border border-border/80 bg-muted/20 px-3 py-3">
        <div className="flex items-baseline gap-2">
          <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Power
          </p>
          <TooltipProvider delay={200}>
            <Tooltip>
              <TooltipTrigger className="cursor-help text-[0.65rem] tracking-wide text-muted-foreground/55 underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
                order
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={6}>
                Start in order: lobby → world → channel. Stop in reverse if
                needed.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <AdminServiceStatus
          workingAll={starting || stopping || restartingAll}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busy || !controlOk || firstBootBlocked}
            onClick={() => setStartOpen(true)}
          >
            {starting ? "Starting…" : "Start all services"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy || !controlOk}
            onClick={() => setStopOpen(true)}
          >
            {stopping ? "Stopping…" : "Stop all services"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy || !controlOk}
            onClick={() => setRestartAllOpen(true)}
          >
            {restartingAll ? "Restarting…" : "Restart all services"}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "border px-3 py-3 transition-colors",
          laneAPending.pending
            ? "border-cyan-400/70 bg-cyan-400/10 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.25)]"
            : "border-border/80 bg-muted/20"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "text-[0.65rem] font-semibold tracking-[0.12em] uppercase",
              laneAPending.pending ? "text-cyan-300" : "text-muted-foreground"
            )}
          >
            Shops &amp; payouts
          </p>
          {laneAPending.pending ? (
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-cyan-400/50 bg-cyan-400/15 px-1.5 py-0.5 text-[0.65rem] font-medium tracking-wide text-cyan-200 uppercase">
              <span
                className="size-1.5 animate-pulse rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]"
                aria-hidden
              />
              Unpublished changes
            </span>
          ) : null}
        </div>
        {laneAPending.pending ? (
          <div className="mt-1.5 space-y-1.5">
            <p className="text-xs text-cyan-100/90">
              Draft differs from the live server. Run{" "}
              <strong className="font-medium text-cyan-50">Validate</strong>{" "}
              before publish so bad game content cannot brick the channel.
            </p>
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-cyan-100/90">
              {laneAPending.shopsDirty ? (
                <li>
                  <span className="font-medium text-cyan-50">Shops</span> —
                  working copy has unpublished shop changes
                </li>
              ) : null}
              {laneAPending.payoutsDirty ? (
                <li>
                  <span className="font-medium text-cyan-50">Payouts</span> —
                  working copy has unpublished payout changes
                </li>
              ) : null}
              {laneAPending.reportRewardsDirty ? (
                <li>
                  <span className="font-medium text-cyan-50">Dungeon loot</span>{" "}
                  — working copy has unpublished boss-crate changes
                </li>
              ) : null}
            </ul>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            <strong className="font-medium text-foreground">Validate</strong>{" "}
            validates draft shops, payout packages, and report rewards without
            changing live (same idea as Config → Check before apply).{" "}
            <strong className="font-medium text-foreground">Publish</strong>{" "}
            copies them live; restart the channel when players should see them.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !controlOk}
            onClick={() => void checkLaneA()}
          >
            {checking ? "Validating…" : "Validate"}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busy || !controlOk}
            onClick={() => openPublishDialog(false)}
            className={
              laneAPending.pending
                ? "bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                : undefined
            }
          >
            {publishing && !publishWithRestart
              ? publishPhase === "validating"
                ? "Validating…"
                : "Publishing…"
              : "Publish"}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busy || !controlOk}
            onClick={() => openPublishDialog(true)}
            className={
              laneAPending.pending
                ? "border border-cyan-300/60 bg-cyan-500/20 text-cyan-50 hover:bg-cyan-500/30"
                : undefined
            }
          >
            {publishing && publishWithRestart
              ? publishPhase === "validating"
                ? "Validating…"
                : publishPhase === "applying"
                  ? "Publishing…"
                  : "Restarting…"
              : "Publish & restart"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !controlOk}
            onClick={() => setRollbackOpen(true)}
          >
            {rollingBack ? "Undoing…" : "Undo last publish"}
          </Button>
        </div>
      </div>

      <div className="border border-border/80 bg-muted/20 px-3 py-3">
        <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Software update
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Downloads new game server builds and restarts lobby, world, and
          channel. Use this after a developer publishes a new image — not for
          shops, config, or file uploads.
        </p>
        {!dockerBackend && controlOk ? (
          <p className="mt-2 text-xs text-muted-foreground">
            This machine runs game servers directly (not Docker), so Update game
            servers stays off here. Rebuild binaries with the usual build script
            on this PC instead.
          </p>
        ) : null}
        <div className="mt-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy || !controlOk || !dockerBackend}
            onClick={() => setLaneCOpen(true)}
          >
            {laneCBusy ? "Updating…" : "Update game servers"}
          </Button>
        </div>
      </div>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent showCloseButton={!starting}>
          <DialogHeader>
            <DialogTitle>Start all services?</DialogTitle>
            <DialogDescription>
              Starts lobby, world, and channel in order. Services that are
              already running are left alone. Character art data and maps must
              already be on disk.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={starting}
              onClick={() => setStartOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={starting}
              onClick={() => void startServers()}
            >
              {starting ? "Starting…" : "Start all services"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stopOpen} onOpenChange={setStopOpen}>
        <DialogContent showCloseButton={!stopping}>
          <DialogHeader>
            <DialogTitle>Stop all services?</DialogTitle>
            <DialogDescription>
              Stops channel, world, and lobby. Everyone in-game will disconnect.
              This website keeps running.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={stopping}
              onClick={() => setStopOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={stopping}
              onClick={() => void stopServers()}
            >
              {stopping ? "Stopping…" : "Stop all services"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restartAllOpen} onOpenChange={setRestartAllOpen}>
        <DialogContent showCloseButton={!restartingAll}>
          <DialogHeader>
            <DialogTitle>Restart all services?</DialogTitle>
            <DialogDescription>
              Restarts lobby, world, and channel. Players disconnect and must
              log back in. Prefer per-service restart when only one process
              needs it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={restartingAll}
              onClick={() => setRestartAllOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={restartingAll}
              onClick={() => void restartAllServices()}
            >
              {restartingAll ? "Restarting…" : "Restart all services"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent showCloseButton={!publishing}>
          <DialogHeader>
            <DialogTitle>
              {publishWithRestart
                ? "Publish game content and restart?"
                : "Publish game content?"}
            </DialogTitle>
            <DialogDescription>
              We validate your drafts first (nothing live changes if validation fails),
              then copy shops and dungeon payouts to the live server
              {publishWithRestart
                ? " and restart the game channel so players pick them up right away."
                : ". The running channel keeps the old data until you restart it (Power → Channel, or Publish & restart)."}{" "}
              Use Undo last publish if something looks wrong.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={publishing}
              onClick={() => setPublishOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={publishing}
              onClick={() => void publishLaneA(publishWithRestart)}
            >
              {publishWithRestart
                ? "Validate, publish & restart"
                : "Validate & publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent showCloseButton={!rollingBack}>
          <DialogHeader>
            <DialogTitle>Undo last publish?</DialogTitle>
            <DialogDescription>
              Restores the previous shops &amp; packages snapshot
              {lastReleaseId ? (
                <>
                  {" "}
                  (<code className="text-foreground">{lastReleaseId}</code>)
                </>
              ) : null}{" "}
              and restarts the game channel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={rollingBack}
              onClick={() => setRollbackOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={rollingBack}
              onClick={() => void rollbackLaneA()}
            >
              {rollingBack ? "Undoing…" : "Undo & restart"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={laneCOpen} onOpenChange={setLaneCOpen}>
        <DialogContent showCloseButton={!laneCBusy}>
          <DialogHeader>
            <DialogTitle>Update game servers?</DialogTitle>
            <DialogDescription>
              Downloads the latest builds and recreates lobby, world, and
              channel. Players disconnect. Only do this after a known-good
              update was published — a bad build can leave the servers down
              until someone fixes them.
            </DialogDescription>
          </DialogHeader>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={laneCIncludeWebsite}
              onChange={(e) => setLaneCIncludeWebsite(e.target.checked)}
              disabled={laneCBusy}
            />
            Also update this website
          </label>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={laneCBusy}
              onClick={() => setLaneCOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={laneCBusy}
              onClick={() => void publishLaneC()}
            >
              {laneCBusy ? "Working…" : "Confirm update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
