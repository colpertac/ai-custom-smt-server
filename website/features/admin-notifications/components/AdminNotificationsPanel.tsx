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

type NotificationSettings = {
  discordWebhook: string
  mention: string
  offlineThresholdSec: number
  notifyServicesDown: boolean
  notifyMannequins: boolean
  notifyFeedback: boolean
  notifyReports: boolean
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

const DEFAULT_SETTINGS: NotificationSettings = {
  discordWebhook: "",
  mention: "",
  offlineThresholdSec: 60,
  notifyServicesDown: true,
  notifyMannequins: true,
  notifyFeedback: false,
  notifyReports: false,
}

type ToggleRow = {
  key: keyof Pick<
    NotificationSettings,
    | "notifyServicesDown"
    | "notifyMannequins"
    | "notifyFeedback"
    | "notifyReports"
  >
  label: string
  description: string
}

const TOGGLE_ROWS: ToggleRow[] = [
  {
    key: "notifyServicesDown",
    label: "Services down",
    description:
      "Discord when lobby, world, or channel stays offline past the threshold (crash watchdog).",
  },
  {
    key: "notifyMannequins",
    label: "Mannequins / studio",
    description:
      "Discord when portrait-watchdog reports mannequins or studio offline.",
  },
  {
    key: "notifyFeedback",
    label: "New feedback",
    description: "Discord when a player submits website feedback.",
  },
  {
    key: "notifyReports",
    label: "New reports",
    description:
      "Discord when a new in-game player report appears (polled via lobby).",
  },
]

export function AdminNotificationsPanel() {
  const [settings, setSettings] =
    useState<NotificationSettings>(DEFAULT_SETTINGS)
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
      const response = await api("admin/notifications/settings")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: {
          settings: NotificationSettings
          maintenanceWindows: MaintenanceWindow[]
          watchdogState: WatchdogState
        }
      }
      if (!response.ok || !json.success || !json.data) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setSettings({ ...DEFAULT_SETTINGS, ...json.data.settings })
      setMaintenanceWindows(json.data.maintenanceWindows || [])
      setWatchdogState(json.data.watchdogState || null)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load notification settings"
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
      const response = await api.post("admin/notifications/settings", {
        json: {
          discordWebhook: settings.discordWebhook,
          mention: settings.mention,
          offlineThresholdSec: Number(settings.offlineThresholdSec),
          notifyServicesDown: settings.notifyServicesDown,
          notifyMannequins: settings.notifyMannequins,
          notifyFeedback: settings.notifyFeedback,
          notifyReports: settings.notifyReports,
        },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: NotificationSettings
      }
      if (!response.ok || !json.success) {
        setError(json.message || "Failed to save settings")
        return
      }
      if (json.data) {
        setSettings({ ...DEFAULT_SETTINGS, ...json.data })
      }
      setOk(json.message || "Notification settings saved")
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
      const response = await api.post("admin/notifications/test", {
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
          <CardTitle>Discord notifications</CardTitle>
        </div>
        <CardDescription>
          One outgoing webhook for crash / studio alerts, new feedback, and new
          player reports. Toggle each event independently.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && <FormAlert variant="error">{error}</FormAlert>}
        {ok && <FormAlert variant="success">{ok}</FormAlert>}

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
            <Field>
              <FieldLabel htmlFor="notify-webhook">
                Discord webhook URL
              </FieldLabel>
              <Input
                id="notify-webhook"
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
                Channel settings → Integrations → Webhooks → New Webhook.
              </p>
            </Field>

            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Notify on
              </p>
              {TOGGLE_ROWS.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between rounded-md border border-border p-3"
                >
                  <div className="space-y-0.5 pr-3">
                    <FieldLabel className="text-sm font-medium">
                      {row.label}
                    </FieldLabel>
                    <p className="text-xs text-muted-foreground">
                      {row.description}
                    </p>
                  </div>
                  <Switch
                    checked={settings[row.key]}
                    onCheckedChange={(checked) =>
                      setSettings((prev) => ({ ...prev, [row.key]: checked }))
                    }
                    disabled={loading || saving}
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="notify-threshold">
                  Offline threshold (seconds)
                </FieldLabel>
                <Input
                  id="notify-threshold"
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
                  disabled={loading || saving || !settings.notifyServicesDown}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Used only for services-down alerts (default 60s).
                </p>
              </Field>

              <Field>
                <FieldLabel htmlFor="notify-mention">
                  Discord mention (optional)
                </FieldLabel>
                <Input
                  id="notify-mention"
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
                  Prefixed on crash / test alerts for urgent pings.
                </p>
              </Field>
            </div>
          </FieldGroup>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button type="submit" disabled={loading || saving}>
              {saving ? "Saving…" : "Save notification settings"}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleTestPing}
              disabled={loading || testing || !settings.discordWebhook}
            >
              <Send className="mr-1.5 size-4" />
              {testing ? "Sending…" : "Send test alert"}
            </Button>
          </div>
        </form>

        {testError && <FormAlert variant="error">{testError}</FormAlert>}
        {testOk && <FormAlert variant="success">{testOk}</FormAlert>}

        {watchdogState && watchdogState.slots && (
          <div className="border-t border-border pt-4">
            <h4 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Watchdog targets
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
