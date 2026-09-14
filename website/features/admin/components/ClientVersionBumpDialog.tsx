"use client"

import { useState } from "react"

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
  COMP_CLIENT_CHANGED_EVENT,
  notifyLaneAPendingChanged,
  OPS_FRESHNESS_EVENT,
} from "@/features/admin/lane-a-pending"
import { api } from "@/lib/kyClient"

export type ClientVersionStatus = {
  lobbyCode: number
  lobbyVersion: string
  overlayCode: number | null
  overlayExists: boolean
  nextCode: number
  nextVersion: string
  mismatched?: boolean
}

export async function fetchClientVersionStatus(): Promise<ClientVersionStatus | null> {
  const response = await api.get("admin/ops/client-version")
  const json = (await response.json()) as {
    success?: boolean
    data?: ClientVersionStatus
  }
  if (!response.ok || !json.success || !json.data) return null
  return json.data
}

export function ClientVersionBumpDialog({
  open,
  status,
  onOpenChange,
  onBumped,
}: {
  open: boolean
  status: ClientVersionStatus | null
  onOpenChange: (open: boolean) => void
  onBumped?: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const bump = async () => {
    if (!status) return
    setBusy(true)
    setError(null)
    try {
      const response = await api.post("admin/ops/client-version/bump", {
        timeout: 180_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { message?: string }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      notifyLaneAPendingChanged()
      window.dispatchEvent(new Event(OPS_FRESHNESS_EVENT))
      window.dispatchEvent(new Event(COMP_CLIENT_CHANGED_EVENT))
      const message =
        json.data?.message || json.message || "Client version bumped"
      onBumped?.(message)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bump failed")
    } finally {
      setBusy(false)
    }
  }

  const skip = () => {
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        onOpenChange(next)
      }}
    >
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>Increase client version?</DialogTitle>
          <DialogDescription>
            The lobby only lets players in if their{" "}
            <code className="text-foreground">comp_client.xml</code> version
            matches Config → Lobby → ClientVersion. A client-file upload does
            not bump that on its own — old installs can still log in without
            ImagineUpdate.
          </DialogDescription>
        </DialogHeader>
        {status ? (
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              Lobby currently accepts{" "}
              <span className="font-medium text-foreground">
                {status.lobbyVersion}
              </span>{" "}
              (code {status.lobbyCode}). Overlay{" "}
              <code className="text-foreground">comp_client.xml</code>
              {status.overlayExists
                ? status.overlayCode != null
                  ? ` is ${status.overlayCode}.`
                  : " is present but has no version tag."
                : " is not on the updater yet — bumping will seed it."}
            </p>
            <p>
              Bump both to{" "}
              <span className="font-medium text-foreground">
                {status.nextVersion}
              </span>{" "}
              (code {status.nextCode}). Players must run ImagineUpdate. Restart
              login from Overview (Power → lobby, or Publish &amp; restart)
              when the new version should take effect. Services are not
              restarted from this dialog.
            </p>
            {status.mismatched ? (
              <p className="text-orange-100">
                Lobby and overlay already disagree — bumping sets both to{" "}
                {status.nextVersion}. To keep the current higher value without
                incrementing, use Set both on Game files or Config → Lobby.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Could not read the current ClientVersion. You can still skip and
            edit Config → Lobby later.
          </p>
        )}
        {error ? <FormAlert variant="error">{error}</FormAlert> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={skip}
          >
            Keep {status?.lobbyVersion ?? "current"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !status}
            onClick={() => void bump()}
          >
            {busy
              ? "Bumping…"
              : status
                ? `Bump to ${status.nextVersion}`
                : "Bump"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
