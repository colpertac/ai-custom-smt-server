"use client"

import { useCallback, useEffect, useState } from "react"
import { Bell, BellOff, Send, ShieldAlert, ShieldCheck } from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/kyClient"

type ServerAlertSettings = {
  discordWebhook: string
  enabled: boolean
  offlineThresholdSec: number
  mention: string
}

type MaintenanceWindow = {
  service: string
  reason: string
  startedAt: number
  expiresAt: number | null
  actor?: string
  detail?: string
}

type WatchdogSlot = {
  service: string
  offlineSince: number | null
  alerted: boolean
  lastAlertAt: number | null
  lastStatus?: string
  lastError?: string
}

type WatchdogState = {
  slots: Record<string, WatchdogSlot>
  lastCheckAt: number | null
}

export function AdminWatchdogPanel() {
  const [settings, setSettings] = useState<ServerAlertSettings>({
    discordWebhook: "",
    enabled: true,
    offlineThresholdSec: 60,
    mention: "",
  })
  const [maintenanceWindows, setMaintenanceWindows] = useState<
    MaintenanceWindow[]
  >([])
  const [watchdogState, setWatchdogState] = useState<WatchdogState | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [testOk, setTestOk] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api("admin/watchdog/settings")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: {
          settings: ServerAlertSettings
          maintenanceWindows: MaintenanceWindow[]
          watchdogState: WatchdogState
        }
      }
      if (!response.ok || !json.success || !json.data) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setSettings(json.data.settings)
      setMaintenanceWindows(json.data.maintenanceWindows || [])
      setWatchdogState(json.data.watchdogState || null)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load watchdog settings"
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/watchdog/settings", {
        json: {
          discordWebhook: settings.discordWebhook,
          enabled: settings.enabled,
          offlineThresholdSec: Number(settings.offlineThresholdSec),
          mention: settings.mention,
        },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: ServerAlertSettings
      }
      if (!response.ok || !json.success) {
        setError(json.message || "Failed to save settings")
        return
      }
      if (json.data) {
        setSettings(json.data)
      }
      setOk(json.message || "Watchdog settings saved")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  const handleTestPing = async () => {
    setTesting(true)
    setTestError(null)
    setTestOk(null)
    try {
      const response = await api.post("admin/watchdog/test", {
        json: {
          discordWebhook: settings.discordWebhook,
        },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setTestError(json.message || "Failed to send test alert")
        return
      }
      setTestOk(json.message || "Test alert sent to Discord successfully!")
    } catch (e) {
      setTestError(
        e instanceof Error ? e.message : "Failed to send test alert"
      )
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-primary" />
          <CardTitle>Crash Watchdog &amp; Discord Alerts (Bootleg Sentry)</CardTitle>
        </div>
        <CardDescription>
          Monitors lobby, world, and channel health. Dispatches rich crash
          traces with exit codes to Discord if a server crashes, while
          automatically suppressing alerts during admin restarts and map file uploads.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <FormAlert variant="error">{error}</FormAlert>}
        {ok && <FormAlert variant="success">{ok}</FormAlert>}

        {/* Maintenance / Smart Suppression Banner */}
        {maintenanceWindows.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-xs">
            <div className="flex items-center gap-2 font-medium text-amber-500">
              <ShieldCheck className="size-4" />
              <span>Smart Suppression Active (Maintenance Mode)</span>
            </div>
            <div className="mt-2 space-y-1 text-muted-foreground">
              {maintenanceWindows.map((win, idx) => {
                const remainingSec = win.expiresAt
                  ? Math.max(0, Math.round((win.expiresAt - Date.now()) / 1000))
                  : null
                return (
                  <div key={idx} className="flex items-center justify-between">
                    <span>
                      <strong className="text-foreground">
                        {win.service.toUpperCase()}
                      </strong>{" "}
                      — {win.reason.replace("_", " ")}
                      {win.detail ? ` (${win.detail})` : ""}
                    </span>
                    <span>
                      {remainingSec != null
                        ? `${remainingSec}s remaining`
                        : "Indefinite (stopped)"}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <FieldGroup className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div className="space-y-0.5">
                <FieldLabel className="text-sm font-medium">
                  Watchdog Monitoring
                </FieldLabel>
                <p className="text-xs text-muted-foreground">
                  Enable automated crash checks and Discord notifications.
                </p>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(checked) =>
                  setSettings((prev) => ({ ...prev, enabled: checked }))
                }
                disabled={loading || saving}
              />
            </div>

            <Field>
              <FieldLabel htmlFor="watchdog-webhook">
                Outgoing Discord Webhook URL
              </FieldLabel>
              <Input
                id="watchdog-webhook"
                type="url"
                placeholder="https://discord.com/api/webhooks/..."
                value={settings.discordWebhook}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    discordWebhook: e.target.value,
                  }))
                }
                disabled={loading || saving}
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                In Discord channel settings, go to Integrations &rarr; Webhooks
                &rarr; New Webhook.
              </p>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="watchdog-threshold">
                  Offline Threshold (Seconds)
                </FieldLabel>
                <Input
                  id="watchdog-threshold"
                  type="number"
                  min={5}
                  max={3600}
                  value={settings.offlineThresholdSec}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      offlineThresholdSec: Number(e.target.value),
                    }))
                  }
                  disabled={loading || saving}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Time a service must continuously stay down before pinging
                  (default: 60s).
                </p>
              </Field>

              <Field>
                <FieldLabel htmlFor="watchdog-mention">
                  Discord Ping Mention (Optional)
                </FieldLabel>
                <Input
                  id="watchdog-mention"
                  type="text"
                  placeholder="@everyone, <@USER_ID>, or <@&ROLE_ID>"
                  value={settings.mention}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      mention: e.target.value,
                    }))
                  }
                  disabled={loading || saving}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Prefix sent with crash notifications for urgent mobile pings.
                </p>
              </Field>
            </div>
          </FieldGroup>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" disabled={loading || saving}>
              {saving ? "Saving…" : "Save Watchdog Settings"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleTestPing}
              disabled={loading || testing || !settings.discordWebhook}
            >
              <Send className="mr-1.5 size-4" />
              {testing ? "Sending…" : "Send Test Alert"}
            </Button>
          </div>
        </form>

        {testError && <FormAlert variant="error">{testError}</FormAlert>}
        {testOk && <FormAlert variant="success">{testOk}</FormAlert>}

        {/* Monitored Services Current Status */}
        {watchdogState && watchdogState.slots && (
          <div className="border-t border-border pt-4">
            <h4 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Monitored Watchdog Targets
            </h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {(["lobby", "world", "channel"] as const).map((svc) => {
                const slot = watchdogState.slots[svc]
                const isDown = slot && slot.offlineSince !== null
                return (
                  <div
                    key={svc}
                    className="flex items-center justify-between rounded-md border border-border bg-card p-3 text-xs"
                  >
                    <div>
                      <span className="font-medium capitalize text-foreground">
                        {svc}
                      </span>
                      <p className="text-muted-foreground">
                        {isDown
                          ? `Offline (${Math.round((Date.now() - (slot.offlineSince ?? Date.now())) / 1000)}s)`
                          : "Healthy"}
                      </p>
                    </div>
                    {isDown ? (
                      <span className="flex items-center gap-1 text-destructive">
                        <Bell className="size-3.5" />
                        {slot.alerted ? "Alerted" : "Pending"}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-500">
                        <BellOff className="size-3.5" />
                        Normal
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
