"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/kyClient"
import { OPS_FRESHNESS_EVENT } from "@/features/admin/lane-a-pending"

type RecoveryStatus = {
  lastSnapshot: {
    id: string
    createdAt: string
    actor: string | null
    reason: string
    fileCount: number
  } | null
  snapshots: Array<{
    id: string
    createdAt: string
    actor: string | null
    reason: string
    fileCount: number
  }>
  hasConfigRelease: boolean
  hasContentRelease: boolean
  configReleaseId: string | null
  contentReleaseId: string | null
}

type ActionKey =
  | "snapshot"
  | "restore-config"
  | "restore-content"
  | "reset-stock"
  | "disable-packages"

type ConfirmState = {
  key: ActionKey
  title: string
  description: string
  confirmWord?: string
} | null

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function AdminRecoveryPanel({
  compact = false,
}: {
  compact?: boolean
} = {}) {
  const [status, setStatus] = useState<RecoveryStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<ActionKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const [typed, setTyped] = useState("")
  const [syncWorking, setSyncWorking] = useState(true)
  const [clearAdminShops, setClearAdminShops] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("admin/ops/recovery/status")
      const json = (await res.json()) as {
        success?: boolean
        data?: RecoveryStatus
        message?: string
      }
      if (!res.ok || !json.success || !json.data) {
        setError(json.message || "Could not load recovery status")
        return
      }
      setStatus(json.data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load recovery status")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const run = useCallback(
    async (key: ActionKey) => {
      setBusy(key)
      setError(null)
      setOk(null)
      setConfirm(null)
      setTyped("")
      try {
        let path = ""
        let body: Record<string, unknown> = {}
        switch (key) {
          case "snapshot":
            path = "admin/ops/recovery/snapshot"
            body = { reason: "manual" }
            break
          case "restore-config":
            path = "admin/ops/recovery/restore-config"
            body = { syncWorking, restart: true }
            break
          case "restore-content":
            path = "admin/ops/recovery/restore-content"
            body = { restart: true }
            break
          case "reset-stock":
            path = "admin/ops/recovery/reset-stock-knobs"
            body = { restart: true }
            break
          case "disable-packages":
            path = "admin/ops/recovery/disable-admin-packages"
            body = { clearAdminShops, restart: true }
            break
        }
        const res = await api.post(path, { json: body, timeout: 180_000 })
        const json = (await res.json()) as {
          success?: boolean
          message?: string
          data?: { warnings?: string[] }
        }
        if (!res.ok || !json.success) {
          setError(json.message || `HTTP ${res.status}`)
          await refresh()
          return
        }
        const warn = json.data?.warnings?.length
          ? ` (${json.data.warnings.join("; ")})`
          : ""
        setOk((json.message || "OK") + warn)
        window.dispatchEvent(new Event(OPS_FRESHNESS_EVENT))
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed")
      } finally {
        setBusy(null)
      }
    },
    [clearAdminShops, refresh, syncWorking]
  )

  const ask = (state: ConfirmState) => {
    setTyped("")
    setConfirm(state)
  }

  if (loading && !status) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading recovery…
      </p>
    )
  }

  const confirmReady =
    !confirm?.confirmWord ||
    typed.trim().toUpperCase() === confirm.confirmWord.toUpperCase()

  return (
    <div className="space-y-3">
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}

      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <div className="font-medium text-foreground">Last snapshot</div>
          <div>{formatWhen(status?.lastSnapshot?.createdAt)}</div>
          {status?.lastSnapshot ? (
            <div className="truncate opacity-80">
              {status.lastSnapshot.fileCount} files · {status.lastSnapshot.reason}
            </div>
          ) : null}
        </div>
        <div>
          <div className="font-medium text-foreground">Config release</div>
          <div>
            {status?.hasConfigRelease
              ? status.configReleaseId
              : "None — stock reset or backup"}
          </div>
        </div>
        <div>
          <div className="font-medium text-foreground">Shops & loot release</div>
          <div>
            {status?.hasContentRelease
              ? status.contentReleaseId
              : "None — disable packages or backup"}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void run("snapshot")}
        >
          {busy === "snapshot" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : null}
          Snapshot live now
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null || !status?.hasContentRelease}
          onClick={() =>
            ask({
              key: "restore-content",
              title: "Restore last shops & loot?",
              description:
                "Use this when the channel dies after Dungeon loot or COMP shop Publish. Snapshots live state first, then restores the previous shops/loot release and restarts channel.",
            })
          }
        >
          Restore shops & loot
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null || !status?.hasConfigRelease}
          onClick={() =>
            ask({
              key: "restore-config",
              title: "Restore last published config?",
              description:
                "Snapshots live state first, then restores lobby/world/channel XML from the last config publish and restarts services.",
            })
          }
        >
          Restore config
        </Button>

        {!compact ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                ask({
                  key: "reset-stock",
                  title: "Reset gameplay knobs to stock?",
                  description:
                    "Keeps DiffieHellman, ExternalIP, StudioToken, WorldIP/LobbyIP, and DB settings. Resets other knobs from install seed templates, publishes, and restarts. Type RESET to confirm.",
                  confirmWord: "RESET",
                })
              }
            >
              Reset stock knobs
            </Button>

            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={busy !== null}
              onClick={() =>
                ask({
                  key: "disable-packages",
                  title: "Disable admin loot/shop packages?",
                  description:
                    "Renames live payout and report-rewards admin zips so channel can boot without them. Editors keep drafts — Publish later brings content back. Type DISABLE to confirm.",
                  confirmWord: "DISABLE",
                })
              }
            >
              Disable admin packages
            </Button>
          </>
        ) : (
          <Link
            href="/admin/recovery"
            className="inline-flex h-8 items-center justify-center rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Open Recovery
          </Link>
        )}
      </div>

      {!compact ? (
        <div className="space-y-2 rounded-md border border-border/60 p-3">
          <Field orientation="horizontal" className="items-center gap-3">
            <Switch
              checked={syncWorking}
              onCheckedChange={setSyncWorking}
              id="recovery-sync-working"
            />
            <FieldLabel htmlFor="recovery-sync-working" className="text-xs">
              After config restore, overwrite Config draft from live (recommended)
            </FieldLabel>
          </Field>
          <Field orientation="horizontal" className="items-center gap-3">
            <Switch
              checked={clearAdminShops}
              onCheckedChange={setClearAdminShops}
              id="recovery-clear-shops"
            />
            <FieldLabel htmlFor="recovery-clear-shops" className="text-xs">
              When disabling packages, also move live compshop-*.xml aside
            </FieldLabel>
          </Field>
        </div>
      ) : null}

      {!compact && status?.snapshots?.length ? (
        <div className="space-y-1">
          <div className="text-xs font-medium">Recent snapshots</div>
          <ul className="max-h-40 space-y-1 overflow-auto text-[11px] text-muted-foreground">
            {status.snapshots.slice(0, 8).map((s) => (
              <li key={s.id} className="flex justify-between gap-2">
                <span className="truncate">{s.id}</span>
                <span className="shrink-0">
                  {s.fileCount}f · {s.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null)
            setTyped("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.description}</DialogDescription>
          </DialogHeader>
          {confirm?.confirmWord ? (
            <Field>
              <FieldLabel htmlFor="recovery-confirm-word">
                Type {confirm.confirmWord} to confirm
              </FieldLabel>
              <Input
                id="recovery-confirm-word"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
            </Field>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirm(null)
                setTyped("")
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!confirmReady || busy !== null || !confirm}
              onClick={() => confirm && void run(confirm.key)}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
