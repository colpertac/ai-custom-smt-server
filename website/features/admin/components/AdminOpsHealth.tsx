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
      return "Validating shops & payouts (building candidate release)…"
    case "applying":
      return "Validation passed — applying to live datastore…"
    case "restarting":
      return "Applied — restarting channel…"
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
  return `New changes made on ${when}${kinds} — channel is running stale data; restart recommended.`
}

function overlayStaleMessage(health: OpsHealth): string | null {
  if (!health.overlayStale) return null
  return "Updater overlay changed — rehash from Content zip so ImagineUpdate can ship the files."
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
        setError(json.data.error || "sidecar reported not ok")
        return
      }
      setError(null)
    } catch (e) {
      setHealth(null)
      setError(e instanceof Error ? e.message : "health request failed")
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
      "Channel restarted",
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
        setError("Validation succeeded but returned no releaseId")
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
            "Datastore applied but channel restart failed — use Restart channel"
        )
        return
      }

      setPublishPhase("done")
      const parts = [
        "Lane A published and channel restarted",
        `release ${releaseId}`,
        applyJson.data?.shopsCopied != null
          ? `${applyJson.data.shopsCopied} shop(s)`
          : null,
        applyJson.data?.payoutsPackaged != null
          ? `${applyJson.data.payoutsPackaged} payout(s)`
          : null,
      ].filter(Boolean)
      const base = parts.join(" — ")
      setOk(warn?.length ? `${base} (${warn.join(" ")})` : base)
      await refresh()
    } catch (e) {
      setPublishPhase("failed")
      setError(e instanceof Error ? e.message : "publish failed")
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
      setOk(json.message || "Lane A rolled back")
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "rollback failed")
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
        [json.message || "Lane C applied", services ? `(${services})` : null]
          .filter(Boolean)
          .join(" ")
      )
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lane C failed")
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

  const verbs = health?.verbs?.length ? health.verbs.join(", ") : "—"
  const sidecarOk = Boolean(health?.ok)
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
    <section className="mt-12">
      <h2 className="font-heading text-xl font-semibold tracking-[0.08em] uppercase">
        Ops sidecar
      </h2>
      <div className="gold-rule mt-2 max-w-[12rem]" />
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        Localhost control plane (Phase 16I). Publish lane A{" "}
        <span className="text-foreground">validates</span> into a candidate
        release, then applies to live datastore and restarts channel. Rollback
        restores the previous snapshot from the last publish.
      </p>
      <AdminOpsMetrics />
      {error ? (
        <FormAlert className="mt-4" variant="error">
          {error}
        </FormAlert>
      ) : null}
      {firstBootBlocked ? (
        <FormAlert className="mt-4" variant="warning">
          First boot incomplete — upload BinaryData and maps before starting
          servers.
        </FormAlert>
      ) : null}
      {staleText ? (
        <FormAlert className="mt-4" variant="warning">
          {staleText}
        </FormAlert>
      ) : null}
      {overlayText ? (
        <FormAlert className="mt-4" variant="warning">
          {overlayText}
        </FormAlert>
      ) : null}
      {progressText ? (
        <FormAlert className="mt-4" variant="success">
          {progressText}
        </FormAlert>
      ) : null}
      {ok ? (
        <FormAlert className="mt-4" variant="success">
          {ok}
        </FormAlert>
      ) : null}
      {sidecarOk && !error && !ok && !progressText && !staleText && !overlayText && !firstBootBlocked ? (
        <FormAlert className="mt-4" variant="success">
          Success — ops sidecar is reachable ({health?.backend ?? "native"}; verbs:{" "}
          {verbs}).
        </FormAlert>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {pending ? "Checking…" : "Check health"}
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={busy || !sidecarOk || firstBootBlocked}
          onClick={() => setStartOpen(true)}
        >
          {starting ? "Starting…" : "Start servers"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={busy || !sidecarOk}
          onClick={() => setStopOpen(true)}
        >
          {stopping ? "Stopping…" : "Stop servers"}
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          disabled={busy || !sidecarOk}
          onClick={() => setPublishOpen(true)}
        >
          {publishing
            ? publishPhase === "validating"
              ? "Validating…"
              : publishPhase === "applying"
                ? "Applying…"
                : "Restarting…"
            : "Publish lane A"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy || !sidecarOk}
          onClick={() => setRollbackOpen(true)}
        >
          {rollingBack ? "Rolling back…" : "Rollback lane A"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={busy || !sidecarOk}
          onClick={() => setRestartOpen(true)}
        >
          {restarting ? "Restarting channel…" : "Restart channel"}
        </Button>
      </div>

      <div className="mt-8">
        <h3 className="font-heading text-sm font-semibold tracking-[0.08em] uppercase">
          Lane C — code / image
        </h3>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Pull Hub images and recreate containers after a C++ / website image
          push. Docker VPS only (
          <code className="text-xs">OPS_BACKEND=docker</code>). Not for shops,
          config XML, or content zips.
        </p>
        {!dockerBackend && sidecarOk ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Current backend is{" "}
            <code className="text-xs">{health?.backend ?? "native"}</code> —
            Lane C stays disabled on this PC. Use{" "}
            <code className="text-xs">scripts/build.sh</code> for native
            binaries.
          </p>
        ) : null}
        <div className="mt-3">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={busy || !sidecarOk || !dockerBackend}
            onClick={() => setLaneCOpen(true)}
          >
            {laneCBusy ? "Pulling / recreating…" : "Pull & recreate images"}
          </Button>
        </div>
      </div>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent showCloseButton={!starting}>
          <DialogHeader>
            <DialogTitle>Start game servers?</DialogTitle>
            <DialogDescription>
              Starts comp_lobby, comp_world, and comp_channel in order. Already-running
              processes are left alone. Requires BinaryData and maps on disk.
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
              Stops channel, world, and lobby. Everyone connected to the game will
              disconnect. The website and updater are not affected.
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
            <DialogTitle>Publish lane A?</DialogTitle>
            <DialogDescription>
              1) Validate into a candidate under{" "}
              <code className="text-foreground">runtime/releases/lane-a/</code>{" "}
              (DropSet conflicts / empty XML fail here — live untouched). 2)
              Snapshot live shops + admin payout zip. 3){" "}
              <span className="text-foreground">Mirror</span> shops (
              <code className="text-foreground">compshop-*.xml</code> only —
              deletes live shops removed from the editor) and restart channel.
              Use Rollback if the new content is wrong.
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
              Validate &amp; apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent showCloseButton={!rollingBack}>
          <DialogHeader>
            <DialogTitle>Rollback lane A?</DialogTitle>
            <DialogDescription>
              Restores the previous snapshot from{" "}
              {lastReleaseId ? (
                <>
                  release <code className="text-foreground">{lastReleaseId}</code>
                </>
              ) : (
                "the latest applied release"
              )}{" "}
              and restarts channel.               Does not touch non-
              <code className="text-foreground">compshop-*.xml</code> files in
              the shops folder.
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
              {rollingBack ? "Rolling back…" : "Rollback & restart"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={restartOpen} onOpenChange={setRestartOpen}>
        <DialogContent showCloseButton={!restarting}>
          <DialogHeader>
            <DialogTitle>Restart comp_channel?</DialogTitle>
            <DialogDescription>
              Everyone in the channel will disconnect and must log back in. Lobby
              and world keep running; only the channel process restarts.
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
              {restarting ? "Restarting…" : "Restart channel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={laneCOpen} onOpenChange={setLaneCOpen}>
        <DialogContent showCloseButton={!laneCBusy}>
          <DialogHeader>
            <DialogTitle>Pull &amp; recreate game images?</DialogTitle>
            <DialogDescription>
              Runs{" "}
              <code className="text-foreground">
                docker compose pull
              </code>{" "}
              then{" "}
              <code className="text-foreground">
                up -d --force-recreate
              </code>{" "}
              for lobby, world, and channel. Players disconnect. A bad Hub image
              can leave the stack down until you SSH and roll back the tag —
              prefer this only after a known-good push.
            </DialogDescription>
          </DialogHeader>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={laneCIncludeWebsite}
              onChange={(e) => setLaneCIncludeWebsite(e.target.checked)}
              disabled={laneCBusy}
            />
            Also pull &amp; recreate website (
            <code className="text-xs">smt-website</code>)
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
              {laneCBusy ? "Working…" : "Confirm pull & recreate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
