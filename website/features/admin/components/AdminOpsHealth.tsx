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
import { AdminOpsMetrics } from "@/features/admin/components/AdminOpsMetrics"
import { api } from "@/lib/kyClient"

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
    releaseId?: string
    phase?: string
    restarted?: boolean
  }
}

type PublishPhase =
  | "idle"
  | "validating"
  | "applying"
  | "restarting"
  | "done"
  | "failed"

function phaseLabel(phase: PublishPhase): string | null {
  switch (phase) {
    case "validating":
      return "Checking shops & rewards…"
    case "applying":
      return "Checks passed — copying to the live server…"
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
  const [restarting, setRestarting] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle")
  const [lastReleaseId, setLastReleaseId] = useState<string | null>(null)
  const [startOpen, setStartOpen] = useState(false)
  const [stopOpen, setStopOpen] = useState(false)
  const [restartOpen, setRestartOpen] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [laneCOpen, setLaneCOpen] = useState(false)
  const [laneCBusy, setLaneCBusy] = useState(false)
  const [laneCIncludeWebsite, setLaneCIncludeWebsite] = useState(false)

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
      setError(e instanceof Error ? e.message : "Could not reach server control")
    } finally {
      setPending(false)
    }
  }, [])

  const runOpsAction = useCallback(
    async (
      path: "admin/ops/start" | "admin/ops/stop" | "admin/ops/restart/channel",
      fallbackOk: string,
      setBusy: (v: boolean) => void,
      closeDialog: () => void
    ) => {
      closeDialog()
      setBusy(true)
      setError(null)
      setOk(null)
      try {
        const response = await api.post(path)
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
      "Game servers started",
      setStarting,
      () => setStartOpen(false)
    )
  }, [runOpsAction])

  const stopServers = useCallback(async () => {
    await runOpsAction(
      "admin/ops/stop",
      "Game servers stopped",
      setStopping,
      () => setStopOpen(false)
    )
  }, [runOpsAction])

  const restartChannel = useCallback(async () => {
    await runOpsAction(
      "admin/ops/restart/channel",
      "Game channel restarted",
      setRestarting,
      () => setRestartOpen(false)
    )
  }, [runOpsAction])

  const publishLaneA = useCallback(async () => {
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
        setError("Checks passed but no publish id came back")
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

      setPublishPhase("restarting")
      const restartRes = await api.post("admin/ops/restart/channel")
      const restartJson = (await restartRes.json()) as OpsActionResponse
      if (!restartRes.ok || !restartJson.success) {
        setPublishPhase("failed")
        setError(
          restartJson.message ||
            "Shops were copied but the game channel did not restart — use Restart game channel"
        )
        return
      }

      setPublishPhase("done")
      const parts = [
        "Shops & rewards published; game channel restarted",
        applyJson.data?.shopsCopied != null
          ? `${applyJson.data.shopsCopied} shop(s)`
          : null,
        applyJson.data?.payoutsPackaged != null
          ? `${applyJson.data.payoutsPackaged} reward pack(s)`
          : null,
      ].filter(Boolean)
      const base = parts.join(" — ")
      setOk(warn?.length ? `${base} (${warn.join(" ")})` : base)
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
    restarting ||
    publishing ||
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
            Start and stop the game, publish shops &amp; rewards, or update
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

      {error ? (
        <FormAlert variant="error">{error}</FormAlert>
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
        <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Power
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busy || !controlOk || firstBootBlocked}
            onClick={() => setStartOpen(true)}
          >
            {starting ? "Starting…" : "Start servers"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy || !controlOk}
            onClick={() => setStopOpen(true)}
          >
            {stopping ? "Stopping…" : "Stop servers"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy || !controlOk}
            onClick={() => setRestartOpen(true)}
          >
            {restarting ? "Restarting…" : "Restart game channel"}
          </Button>
        </div>
      </div>

      <div className="border border-border/80 bg-muted/20 px-3 py-3">
        <p className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Shops &amp; rewards
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Push your draft shop prices and dungeon rewards to the live server,
          then restart the game channel so players see them.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busy || !controlOk}
            onClick={() => setPublishOpen(true)}
          >
            {publishing
              ? publishPhase === "validating"
                ? "Checking…"
                : publishPhase === "applying"
                  ? "Publishing…"
                  : "Restarting…"
              : "Publish shops & rewards"}
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
            <DialogTitle>Start game servers?</DialogTitle>
            <DialogDescription>
              Starts login (lobby), world, and game channel in order. Servers
              that are already running are left alone. Character art data and
              maps must already be on disk.
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
              {starting ? "Starting…" : "Start servers"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stopOpen} onOpenChange={setStopOpen}>
        <DialogContent showCloseButton={!stopping}>
          <DialogHeader>
            <DialogTitle>Stop game servers?</DialogTitle>
            <DialogDescription>
              Stops the game channel, world, and login server. Everyone in-game
              will disconnect. This website keeps running.
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
              {stopping ? "Stopping…" : "Stop servers"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent showCloseButton={!publishing}>
          <DialogHeader>
            <DialogTitle>Publish shops &amp; rewards?</DialogTitle>
            <DialogDescription>
              We check your drafts first (nothing live changes if checks fail),
              then copy shops and dungeon rewards to the live server and restart
              the game channel. Use Undo last publish if something looks wrong.
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
              onClick={() => void publishLaneA()}
            >
              Check &amp; publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent showCloseButton={!rollingBack}>
          <DialogHeader>
            <DialogTitle>Undo last publish?</DialogTitle>
            <DialogDescription>
              Restores the previous shops &amp; rewards snapshot
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

      <Dialog open={restartOpen} onOpenChange={setRestartOpen}>
        <DialogContent showCloseButton={!restarting}>
          <DialogHeader>
            <DialogTitle>Restart game channel?</DialogTitle>
            <DialogDescription>
              Everyone in the game world will disconnect and must log back in.
              Login and world keep running; only the game channel restarts.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={restarting}
              onClick={() => setRestartOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={restarting}
              onClick={() => void restartChannel()}
            >
              {restarting ? "Restarting…" : "Restart game channel"}
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
