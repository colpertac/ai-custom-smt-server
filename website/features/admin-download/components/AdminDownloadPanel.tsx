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
  websiteUrl: string
  includeLocalServer: boolean
  localTitle: string
  localHost: string
  localTag: string
}

/** Set true to show :8765 updater landing page publish (fallback; most use /updater/news). */
const SHOW_PUBLISH_UPDATER_PAGE = false

const defaultPrep = (): PrepForm => ({
  host: "",
  domain: "",
  lobbyPort: "10666",
  updaterPort: "8765",
  loginPort: "10999",
  title: "Private SMT",
  tag: "main",
  websiteUrl: "",
  includeLocalServer: false,
  localTitle: "Local Server",
  localHost: "127.0.0.1",
  localTag: "local",
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
  const [savingPrep, setSavingPrep] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [dlRes, prepRes] = await Promise.all([
        api("admin/download/settings"),
        api("admin/download/client-prep"),
      ])
      const dlJson = (await dlRes.json()) as {
        success?: boolean
        message?: string
        data?: { settings?: DownloadSettings }
      }
      const prepJson = (await prepRes.json()) as {
        success?: boolean
        message?: string
        data?: { prep?: PrepForm }
      }
      if (!dlRes.ok || !dlJson.success) {
        setError(dlJson.message || `HTTP ${dlRes.status}`)
        return
      }
      if (dlJson.data?.settings) setSettings(dlJson.data.settings)
      if (prepRes.ok && prepJson.success && prepJson.data?.prep) {
        setPrep(prepJson.data.prep)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings")
    } finally {
      setLoading(false)
    }
  }, [])

  const savePrep = useCallback(async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) {
      setSavingPrep(true)
      setError(null)
      setOk(null)
    }
    try {
      const response = await api.put("admin/download/client-prep", {
        json: prep,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { prep?: PrepForm }
      }
      if (!response.ok || !json.success) {
        if (!opts?.quiet) {
          setError(json.message || `HTTP ${response.status}`)
        }
        return false
      }
      if (json.data?.prep) setPrep(json.data.prep)
      if (!opts?.quiet) setOk("Client prep saved")
      return true
    } catch (e) {
      if (!opts?.quiet) {
        setError(e instanceof Error ? e.message : "Save failed")
      }
      return false
    } finally {
      if (!opts?.quiet) setSavingPrep(false)
    }
  }, [prep])

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

  const serverLabel = () => {
    const host = prep.host.trim()
    if (!host) return ""
    const port = Number.parseInt(prep.lobbyPort, 10)
    return Number.isFinite(port) ? `${host}:${port}` : host
  }

  const publishUpdaterPage = async () => {
    setPublishing(true)
    setError(null)
    setOk(null)
    try {
      if (!(await savePrep({ quiet: true }))) {
        setError("Could not save client prep before publishing")
        return
      }
      const response = await api.put("admin/download/updater-site", {
        json: {
          websiteUrl: prep.websiteUrl.trim(),
          pageTitle: prep.title.trim() || undefined,
          serverLabel: serverLabel(),
          publish: true,
        },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Updater landing page published")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed")
    } finally {
      setPublishing(false)
    }
  }

  const downloadPrepZip = async () => {
    setZipping(true)
    setError(null)
    setOk(null)
    try {
      if (!(await savePrep({ quiet: true }))) {
        setError("Could not save client prep before building zip")
        return
      }
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
          websiteUrl: prep.websiteUrl.trim() || undefined,
          includeLocalServer: prep.includeLocalServer,
          localTitle: prep.localTitle.trim() || undefined,
          localHost: prep.localHost.trim() || undefined,
          localTag: prep.localTag.trim() || undefined,
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
              <p className="mt-1 text-xs text-muted-foreground">
                Primary server tag — must differ from the local tag when both are
                enabled.
              </p>
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
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="prep-website">
                Website URL (ImagineUpdate Information)
              </FieldLabel>
              <Input
                id="prep-website"
                value={prep.websiteUrl}
                onChange={(e) =>
                  setPrep((p) => ({ ...p, websiteUrl: e.target.value }))
                }
                placeholder="http://192.168.0.230:3500/updater/news"
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                ImagineUpdate <code className="text-foreground">Information</code>{" "}
                URL — use your lightweight news page (
                <code className="text-foreground">/updater/news</code>) instead of
                the main site; the updater browser cannot render modern CSS.
              </p>
            </Field>
          </FieldGroup>

          <div className="space-y-3 rounded-md border border-border p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={prep.includeLocalServer}
                onChange={(e) =>
                  setPrep((p) => ({
                    ...p,
                    includeLocalServer: e.target.checked,
                  }))
                }
              />
              <span>
                <span className="font-medium">Include local server</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Adds a second entry to VersionData so ImagineUpdate shows a
                  server dropdown (e.g. private server + 127.0.0.1).
                </span>
              </span>
            </label>

            {prep.includeLocalServer ? (
              <FieldGroup className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="prep-local-title">Local title</FieldLabel>
                  <Input
                    id="prep-local-title"
                    value={prep.localTitle}
                    onChange={(e) =>
                      setPrep((p) => ({ ...p, localTitle: e.target.value }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="prep-local-host">Local host</FieldLabel>
                  <Input
                    id="prep-local-host"
                    value={prep.localHost}
                    onChange={(e) =>
                      setPrep((p) => ({ ...p, localHost: e.target.value }))
                    }
                    placeholder="127.0.0.1"
                    autoComplete="off"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="prep-local-tag">Local tag</FieldLabel>
                  <Input
                    id="prep-local-tag"
                    value={prep.localTag}
                    onChange={(e) =>
                      setPrep((p) => ({ ...p, localTag: e.target.value }))
                    }
                  />
                </Field>
              </FieldGroup>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            Zip includes ImagineClient.dat, ImagineUpdate(.dat / -user),
            VersionData(.txt / -user), and encrypted{" "}
            <code className="text-foreground">webaccess.sdat.&lt;tag&gt;</code> per
            server (plus <code className="text-foreground">webaccess.sdat</code> for
            the primary). Requires ops sidecar with comp_encrypt.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={savingPrep}
              onClick={() => void savePrep()}
            >
              {savingPrep ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={zipping || !prep.host.trim()}
              onClick={() => void downloadPrepZip()}
            >
              {zipping ? "Building…" : "Download client-config.zip"}
            </Button>
            {SHOW_PUBLISH_UPDATER_PAGE ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={publishing || !prep.host.trim()}
                onClick={() => void publishUpdaterPage()}
              >
                {publishing ? "Publishing…" : "Publish updater page"}
              </Button>
            ) : null}
          </div>
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
