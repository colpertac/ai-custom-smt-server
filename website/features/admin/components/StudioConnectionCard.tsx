"use client"

import { useCallback, useEffect, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { notifyLaneAPendingChanged } from "@/features/admin/lane-a-pending"
import { api } from "@/lib/kyClient"

type StudioConnectionSettings = {
  studioUrl: string
  studioTokenConfigured: boolean
  workerTokenConfigured: boolean
  studioTokenFromEnv: boolean
  workerTokenFromEnv: boolean
  channelTokenConfigured?: boolean
  channelTokenMatchesWebsite?: boolean
}

type SettingsResponse = {
  success?: boolean
  message?: string
  data?: {
    settings?: StudioConnectionSettings
    channelSync?: { restartNeeded?: boolean }
  }
}

async function loadSettings(): Promise<
  | { data: StudioConnectionSettings; error?: undefined }
  | { data?: undefined; error: string }
> {
  try {
    const response = await api("admin/studio/settings")
    const json = (await response.json()) as SettingsResponse
    if (!response.ok || !json.success || !json.data?.settings) {
      return { error: json.message || `HTTP ${response.status}` }
    }
    return { data: json.data.settings }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load settings" }
  }
}

/**
 * Admin → Portraits: channel studio API (live armory stats) URL + token, and the render
 * worker token. Saving a studio token also writes the channel draft StudioToken.
 */
export function StudioConnectionCard() {
  const [conn, setConn] = useState<StudioConnectionSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [studioUrlDraft, setStudioUrlDraft] = useState("")
  const [studioTokenDraft, setStudioTokenDraft] = useState("")
  const [workerTokenDraft, setWorkerTokenDraft] = useState("")
  const [restartNeeded, setRestartNeeded] = useState(false)

  const apply = useCallback((result: Awaited<ReturnType<typeof loadSettings>>) => {
    if (result.data) {
      setConn(result.data)
      setStudioUrlDraft(result.data.studioUrl)
      setError(null)
    } else {
      setError(result.error)
    }
  }, [])

  useEffect(() => {
    let alive = true
    void loadSettings().then((result) => {
      if (alive) apply(result)
    })
    return () => {
      alive = false
    }
  }, [apply])

  async function refresh() {
    setLoading(true)
    apply(await loadSettings())
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const payload: {
        studioUrl: string
        studioToken?: string
        workerToken?: string
      } = { studioUrl: studioUrlDraft.trim() }
      if (studioTokenDraft.trim()) payload.studioToken = studioTokenDraft.trim()
      if (workerTokenDraft.trim()) payload.workerToken = workerTokenDraft.trim()

      const response = await api.put("admin/studio/settings", {
        json: payload,
        timeout: 60_000,
      })
      const json = (await response.json()) as SettingsResponse
      if (!response.ok || !json.success || !json.data?.settings) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setConn(json.data.settings)
      setStudioUrlDraft(json.data.settings.studioUrl)
      setStudioTokenDraft("")
      setWorkerTokenDraft("")
      const needsRestart = Boolean(json.data.channelSync?.restartNeeded)
      setRestartNeeded(needsRestart)
      if (needsRestart) notifyLaneAPendingChanged()
      setOk(json.message || "Connection settings saved")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border border-border bg-card/60 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Connection</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Channel studio API (live armory stats) and the render worker
            token. Saving a studio token also updates the channel draft
            StudioToken.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? "…" : "Reload"}
        </Button>
      </div>

      {error && <FormAlert variant="error">{error}</FormAlert>}
      {ok && <FormAlert variant="success">{ok}</FormAlert>}
      {restartNeeded ? (
        <p className="text-xs text-sky-600 dark:text-sky-400">
          Channel restart needed — publish from Overview for the new
          StudioToken.
        </p>
      ) : null}
      {conn && conn.channelTokenConfigured && !conn.channelTokenMatchesWebsite ? (
        <p className="text-xs text-amber-500">
          Channel StudioToken differs from the website token — live armory
          stats will fail until they match.
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <Field className="gap-1">
          <FieldLabel htmlFor="studio-url" className="text-[11px]">
            Channel studio API URL
          </FieldLabel>
          <Input
            id="studio-url"
            placeholder="http://127.0.0.1:14700"
            value={studioUrlDraft}
            onChange={(e) => setStudioUrlDraft(e.target.value)}
            autoComplete="off"
            className="h-8 text-xs font-mono"
          />
          <FieldDescription className="text-[11px]">
            Channel StudioHttpPort, reachable from this website.
          </FieldDescription>
        </Field>
        <Field className="gap-1">
          <FieldLabel htmlFor="studio-token" className="text-[11px]">
            Studio token
          </FieldLabel>
          <Input
            id="studio-token"
            type="password"
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            name="portrait-studio-token"
            placeholder={
              conn?.studioTokenConfigured
                ? "Leave blank to keep"
                : "Channel StudioToken"
            }
            value={studioTokenDraft}
            onChange={(e) => setStudioTokenDraft(e.target.value)}
            className="h-8 text-xs"
          />
          <FieldDescription className="text-[11px]">
            Same as channel.xml StudioToken (X-Studio-Token).
          </FieldDescription>
        </Field>
        <Field className="gap-1">
          <FieldLabel htmlFor="studio-worker-token" className="text-[11px]">
            Worker token
          </FieldLabel>
          <Input
            id="studio-worker-token"
            type="password"
            autoComplete="new-password"
            data-1p-ignore
            data-lpignore="true"
            name="portrait-worker-token"
            placeholder={
              conn?.workerTokenConfigured
                ? "Leave blank to keep"
                : "Optional (= studio token)"
            }
            value={workerTokenDraft}
            onChange={(e) => setWorkerTokenDraft(e.target.value)}
            className="h-8 text-xs"
          />
          <FieldDescription className="text-[11px]">
            Render worker PORTRAIT_WORKER_TOKEN; blank reuses the studio token.
          </FieldDescription>
        </Field>
      </div>

      <Button
        type="button"
        size="sm"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  )
}
