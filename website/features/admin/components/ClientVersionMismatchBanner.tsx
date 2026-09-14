"use client"

import { useCallback, useEffect, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  COMP_CLIENT_CHANGED_EVENT,
  notifyLaneAPendingChanged,
  OPS_FRESHNESS_EVENT,
} from "@/features/admin/lane-a-pending"
import {
  describeClientVersionMismatch,
  formatLobbyVersion,
  lobbyFloatToCode,
  type ClientVersionMismatch,
} from "@/lib/client-version-pair"
import { api } from "@/lib/kyClient"

function mismatchCopy(info: ClientVersionMismatch): string {
  if (info.reason === "overlay_missing") {
    return `Lobby ClientVersion is ${info.lobbyVersion} (code ${info.lobbyCode}), but overlay/comp_client.xml is not on the updater yet. Players need a matching overlay.`
  }
  if (info.reason === "overlay_no_version") {
    return `Overlay/comp_client.xml has no <version> tag. Lobby expects ${info.lobbyVersion} (code ${info.lobbyCode}).`
  }
  return `Overlay version ${info.overlayCode} does not match lobby ClientVersion ${info.lobbyVersion} (code ${info.lobbyCode}). The lobby will reject clients that do not match. Fix sets both to the higher value ${info.targetVersion} (code ${info.targetCode}).${
    info.overlayCode != null && info.overlayCode < info.lobbyCode
      ? " Saving the overlay as-is would lower lobby to the overlay value."
      : ""
  }`
}

function fixLabel(info: ClientVersionMismatch): string {
  if (info.reason === "overlay_missing") {
    return `Write overlay at ${info.targetVersion}`
  }
  if (info.reason === "overlay_no_version") {
    return `Add version ${info.targetCode}`
  }
  return `Set both to ${info.targetVersion}`
}

export async function syncClientVersionPair(opts?: {
  hintCode?: number
  xml?: string
}): Promise<{ message: string; toCode: number; toVersion: string }> {
  const response = await api.post("admin/ops/client-version/sync", {
    json: {
      hintCode: opts?.hintCode,
      xml: opts?.xml,
    },
    timeout: 180_000,
  })
  const json = (await response.json()) as {
    success?: boolean
    message?: string
    data?: { message?: string; toCode?: number; toVersion?: string }
  }
  if (!response.ok || !json.success) {
    throw new Error(json.message || `HTTP ${response.status}`)
  }
  notifyLaneAPendingChanged()
  window.dispatchEvent(new Event(OPS_FRESHNESS_EVENT))
  window.dispatchEvent(new Event(COMP_CLIENT_CHANGED_EVENT))
  const toCode = json.data?.toCode ?? opts?.hintCode ?? 0
  return {
    message: json.data?.message || json.message || "Client versions synced",
    toCode,
    toVersion: json.data?.toVersion || formatLobbyVersion(toCode),
  }
}

export function ClientVersionMismatchBanner({
  info,
  busy,
  onFix,
}: {
  info: ClientVersionMismatch
  busy?: boolean
  onFix?: () => void
}) {
  if (!info.mismatched) return null
  return (
    <FormAlert variant="warning" className="space-y-2">
      <p>{mismatchCopy(info)}</p>
      {onFix ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={onFix}
        >
          {busy ? "Fixing…" : fixLabel(info)}
        </Button>
      ) : null}
    </FormAlert>
  )
}

/** Config → Lobby ClientVersion: warn if overlay on disk disagrees. */
export function ClientVersionFieldGuard({
  lobbyValue,
  onSynced,
}: {
  lobbyValue: unknown
  onSynced?: (versionFloat: number) => void
}) {
  const [overlayCode, setOverlayCode] = useState<number | null>(null)
  const [overlayExists, setOverlayExists] = useState(false)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await api.get("admin/ops/client-version", {
        cache: "no-store",
      })
      const json = (await response.json()) as {
        success?: boolean
        data?: { overlayCode?: number | null; overlayExists?: boolean }
      }
      if (!response.ok || !json.success || !json.data) return
      setOverlayCode(
        typeof json.data.overlayCode === "number" ? json.data.overlayCode : null
      )
      setOverlayExists(Boolean(json.data.overlayExists))
      setReady(true)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onChange = () => void refresh()
    window.addEventListener(COMP_CLIENT_CHANGED_EVENT, onChange)
    window.addEventListener(OPS_FRESHNESS_EVENT, onChange)
    return () => {
      window.removeEventListener(COMP_CLIENT_CHANGED_EVENT, onChange)
      window.removeEventListener(OPS_FRESHNESS_EVENT, onChange)
    }
  }, [refresh])

  const lobbyCode = lobbyFloatToCode(lobbyValue)
  const info = describeClientVersionMismatch({
    lobbyCode,
    overlayCode,
    overlayExists,
  })

  const fix = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await syncClientVersionPair({ hintCode: lobbyCode })
      onSynced?.(Number(result.toVersion))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed")
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return null

  return (
    <div className="space-y-2">
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      <ClientVersionMismatchBanner
        info={info}
        busy={busy}
        onFix={() => void fix()}
      />
    </div>
  )
}
