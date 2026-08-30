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

type EmailSettings = {
  publicSiteUrl: string
  fromEmail: string
  fromName: string
  apiKeyConfigured: boolean
  resetSecretConfigured: boolean
  mailConfigured: boolean
}

export function AdminEmailPanel() {
  const [settings, setSettings] = useState<EmailSettings>({
    publicSiteUrl: "",
    fromEmail: "",
    fromName: "SMT",
    apiKeyConfigured: false,
    resetSecretConfigured: false,
    mailConfigured: false,
  })
  const [apiKey, setApiKey] = useState("")
  const [testTo, setTestTo] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [restartingLobby, setRestartingLobby] = useState(false)
  const [lobbyStatus, setLobbyStatus] = useState<string | null>(null)
  const [lobbyReady, setLobbyReady] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const loadLobbyStatus = useCallback(async () => {
    try {
      const response = await api("admin/email/lobby-status")
      const json = (await response.json()) as {
        success?: boolean
        data?: { lobbyReady?: boolean; message?: string }
      }
      if (response.ok && json.success && json.data) {
        setLobbyReady(json.data.lobbyReady ?? false)
        setLobbyStatus(json.data.message ?? null)
      }
    } catch {
      setLobbyReady(null)
      setLobbyStatus(null)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api("admin/email/settings")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { settings?: EmailSettings }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      if (json.data?.settings) setSettings(json.data.settings)
      void loadLobbyStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings")
    } finally {
      setLoading(false)
    }
  }, [loadLobbyStatus])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const save = async () => {
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const payload: Record<string, string> = {
        publicSiteUrl: settings.publicSiteUrl,
        fromEmail: settings.fromEmail,
        fromName: settings.fromName,
      }
      if (apiKey.trim()) payload.apiKey = apiKey.trim()

      const response = await api.put("admin/email/settings", { json: payload })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { settings?: EmailSettings }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      if (json.data?.settings) setSettings(json.data.settings)
      setApiKey("")
      setOk(
        "Saved. Restart the lobby so it loads the password-reset secret file."
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    setTesting(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/email/test", {
        json: { to: testTo.trim() },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Test email sent")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test send failed")
    } finally {
      setTesting(false)
    }
  }

  const restartLobby = async () => {
    setRestartingLobby(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/ops/restart/lobby", {
        timeout: 180_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || "Lobby restarted")
      void loadLobbyStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lobby restart failed")
    } finally {
      setRestartingLobby(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <div className="space-y-6">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resend (transactional email)</CardTitle>
          <CardDescription>
            Powers welcome mail and forgot-password links. Get an API key at{" "}
            <a
              href="https://resend.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              resend.com
            </a>{" "}
            and verify your sender domain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email-site-url">Website URL</FieldLabel>
              <Input
                id="email-site-url"
                placeholder="https://play.example.com"
                value={settings.publicSiteUrl}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, publicSiteUrl: e.target.value }))
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Public portal address — used in reset links, welcome mail, and the
                email footer. Match what players type in the browser.
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor="email-api-key">Resend API key</FieldLabel>
              <Input
                id="email-api-key"
                type="password"
                autoComplete="off"
                placeholder={
                  settings.apiKeyConfigured
                    ? "Leave blank to keep current key"
                    : "re_xxxxxxxx"
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              {settings.apiKeyConfigured ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  A key is saved. Enter a new value only to replace it.
                </p>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="email-from">From email</FieldLabel>
              <Input
                id="email-from"
                type="email"
                placeholder="noreply@yourdomain.com"
                value={settings.fromEmail}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, fromEmail: e.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email-from-name">From name</FieldLabel>
              <Input
                id="email-from-name"
                value={settings.fromName}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, fromName: e.target.value }))
                }
              />
            </Field>
          </FieldGroup>

          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save email settings"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password reset</CardTitle>
          <CardDescription>
            The lobby needs the same secret as the website. It is stored here and
            written to{" "}
            <code className="text-xs">website-data/comp-reset-secret</code> for
            the lobby container on startup.
            {settings.resetSecretConfigured ? (
              <> Secret is configured.</>
            ) : (
              <> Saving generates one automatically.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lobbyReady === false && lobbyStatus ? (
            <FormAlert>{lobbyStatus}</FormAlert>
          ) : null}
          {lobbyReady === true && lobbyStatus ? (
            <FormAlert variant="success">{lobbyStatus}</FormAlert>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Only accounts with a real email receive reset links. After saving,
            restart the lobby once so it reads{" "}
            <code className="text-[0.65rem]">comp-reset-secret</code>.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={restartingLobby || !settings.resetSecretConfigured}
            onClick={() => void restartLobby()}
          >
            {restartingLobby ? "Restarting lobby…" : "Restart lobby"}
          </Button>
          {!settings.resetSecretConfigured ? (
            <p className="text-xs text-muted-foreground">
              Save email settings first to generate the reset secret.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Send test email</CardTitle>
          <CardDescription>
            {settings.mailConfigured
              ? "Verify delivery before players use forgot password."
              : "Save a Resend API key and from address first."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <Field className="min-w-[16rem] flex-1">
            <FieldLabel htmlFor="email-test-to">Send to</FieldLabel>
            <Input
              id="email-test-to"
              type="email"
              placeholder="you@example.com"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={testing || !settings.mailConfigured || !testTo.trim()}
            onClick={() => void sendTest()}
          >
            {testing ? "Sending…" : "Send test"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
