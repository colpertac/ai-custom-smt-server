"use client"

import { useCallback, useEffect, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { api } from "@/lib/kyClient"

type DownloadSettings = {
  url: string
  label: string
  notes: string
}

type PrepForm = {
  host: string
  domain: string
  lobbyPort: string
  updaterPort: string
  loginPort: string
  title: string
  tag: string
}

const defaultPrep = (): PrepForm => ({
  host: "",
  domain: "",
  lobbyPort: "10666",
  updaterPort: "8765",
  loginPort: "10999",
  title: "Private SMT",
  tag: "local",
})

export function AdminDownloadPanel() {
  const [prep, setPrep] = useState<PrepForm>(defaultPrep)
  const [settings, setSettings] = useState<DownloadSettings>({
    url: "",
    label: "Download client",
    notes: "",
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api("admin/download/settings")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { settings?: DownloadSettings }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      if (json.data?.settings) setSettings(json.data.settings)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const saveLink = async () => {
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.put("admin/download/settings", {
        json: settings,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { settings?: DownloadSettings }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      if (json.data?.settings) setSettings(json.data.settings)
      setOk("Player download link saved")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const downloadPrepZip = async () => {
    setZipping(true)
    setError(null)
    setOk(null)
    try {
      const lobbyPort = Number.parseInt(prep.lobbyPort, 10)
      const updaterPort = Number.parseInt(prep.updaterPort, 10)
      const loginPort = Number.parseInt(prep.loginPort, 10)
      const response = await api.post("admin/download/config-zip", {
        json: {
          host: prep.host.trim(),
          domain: prep.domain.trim() || undefined,
          lobbyPort: Number.isFinite(lobbyPort) ? lobbyPort : undefined,
          updaterPort: Number.isFinite(updaterPort) ? updaterPort : undefined,
          loginPort: Number.isFinite(loginPort) ? loginPort : undefined,
          title: prep.title.trim() || undefined,
          tag: prep.tag.trim() || undefined,
        },
      })
      if (!response.ok) {
        let message = `HTTP ${response.status}`
        try {
          const json = (await response.json()) as { message?: string }
          if (json.message) message = json.message
        } catch {
          /* zip or plain */
        }
        setError(message)
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "client-config.zip"
      a.click()
      URL.revokeObjectURL(url)
      setOk("Downloaded client-config.zip — drop files into your client folder")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Zip failed")
    } finally {
      setZipping(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="space-y-6">
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client prep</CardTitle>
          <CardDescription>
            Owner-only: generate connection files for your stock client (IP /
            domain). Drop them into the client folder, zip the whole client,
            upload to MediaFire / Drive, then paste the link below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldGroup className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="prep-host">Host (IP or hostname)</FieldLabel>
              <Input
                id="prep-host"
                value={prep.host}
                onChange={(e) =>
                  setPrep((p) => ({ ...p, host: e.target.value }))
                }
                placeholder="192.168.0.230"
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prep-domain">
                Domain (optional, for updater / login URLs)
              </FieldLabel>
              <Input
                id="prep-domain"
                value={prep.domain}
                onChange={(e) =>
                  setPrep((p) => ({ ...p, domain: e.target.value }))
                }
                placeholder="play.example.com"
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prep-title">Server title</FieldLabel>
              <Input
                id="prep-title"
                value={prep.title}
                onChange={(e) =>
                  setPrep((p) => ({ ...p, title: e.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prep-tag">VersionData tag</FieldLabel>
              <Input
                id="prep-tag"
                value={prep.tag}
                onChange={(e) =>
                  setPrep((p) => ({ ...p, tag: e.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prep-lobby">Lobby port</FieldLabel>
              <Input
                id="prep-lobby"
                type="number"
                value={prep.lobbyPort}
                onChange={(e) =>
                  setPrep((p) => ({ ...p, lobbyPort: e.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prep-updater">Updater port</FieldLabel>
              <Input
                id="prep-updater"
                type="number"
                value={prep.updaterPort}
                onChange={(e) =>
                  setPrep((p) => ({ ...p, updaterPort: e.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="prep-login">Login / webaccess port</FieldLabel>
              <Input
                id="prep-login"
                type="number"
                value={prep.loginPort}
                onChange={(e) =>
                  setPrep((p) => ({ ...p, loginPort: e.target.value }))
                }
              />
            </Field>
          </FieldGroup>
          <p className="text-xs text-muted-foreground">
            Zip includes ImagineClient.dat, ImagineUpdate(.dat / -user),
            VersionData(.txt / -user), and encrypted webaccess.sdat(+.local).
            Requires ops sidecar with comp_encrypt.
          </p>
          <Button
            type="button"
            size="sm"
            disabled={zipping || !prep.host.trim()}
            onClick={() => void downloadPrepZip()}
          >
            {zipping ? "Building…" : "Download client-config.zip"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Player download link</CardTitle>
          <CardDescription>
            After you upload the full client zip, paste the MediaFire / Drive
            URL. Players see this on the public Download page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field>
            <FieldLabel htmlFor="dl-url">Download URL</FieldLabel>
            <Input
              id="dl-url"
              value={settings.url}
              onChange={(e) =>
                setSettings((s) => ({ ...s, url: e.target.value }))
              }
              placeholder="https://www.mediafire.com/file/…"
              autoComplete="off"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="dl-label">Button label</FieldLabel>
            <Input
              id="dl-label"
              value={settings.label}
              onChange={(e) =>
                setSettings((s) => ({ ...s, label: e.target.value }))
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="dl-notes">Notes (optional)</FieldLabel>
            <Input
              id="dl-notes"
              value={settings.notes}
              onChange={(e) =>
                setSettings((s) => ({ ...s, notes: e.target.value }))
              }
              placeholder="Windows only · unzip and run ImagineUpdate.exe"
            />
          </Field>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => void saveLink()}
          >
            {saving ? "Saving…" : "Save link"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
