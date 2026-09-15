"use client"

import { useCallback, useEffect, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { api } from "@/lib/kyClient"
import { ATLAS_ASK_MODEL } from "@/lib/ask-atlas-constants"

type AskSettings = {
  configured: boolean
  hint: string | null
  enabled: boolean
  model: string
}

export function AdminAskSettingsPanel() {
  const [settings, setSettings] = useState<AskSettings>({
    configured: false,
    hint: null,
    enabled: false,
    model: ATLAS_ASK_MODEL,
  })
  const [apiKey, setApiKey] = useState("")
  const [enabled, setEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const applySettings = useCallback((next: AskSettings) => {
    setSettings(next)
    setEnabled(next.enabled)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api("admin/ask/settings")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { settings?: AskSettings }
      }
      if (!response.ok || !json.success || !json.data?.settings) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      applySettings(json.data.settings)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load ask settings")
    } finally {
      setLoading(false)
    }
  }, [applySettings])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const payload: { apiKey?: string; enabled?: boolean } = { enabled }
      if (apiKey.trim()) payload.apiKey = apiKey.trim()

      const response = await api.put("admin/ask/settings", { json: payload })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { settings?: AskSettings }
      }
      if (!response.ok || !json.success || !json.data?.settings) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      applySettings(json.data.settings)
      setApiKey("")
      setOk("Help chatbot settings saved")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const clearKey = async () => {
    setClearing(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.put("admin/ask/settings", {
        json: { clear: true },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { settings?: AskSettings }
      }
      if (!response.ok || !json.success || !json.data?.settings) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      applySettings(json.data.settings)
      setApiKey("")
      setOk("Atlas API key cleared")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed")
    } finally {
      setClearing(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Help chatbot (Atlas Cloud)</CardTitle>
        <CardDescription>
          Conversational answers on{" "}
          <a href="/help" className="text-gold-dim hover:text-gold">
            /help
          </a>{" "}
          using DeepSeek grounded in quest catalogs. Get an API key from{" "}
          <a
            href="https://console.atlascloud.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold-dim hover:text-gold"
          >
            console.atlascloud.ai
          </a>
          . Model:{" "}
          <code className="text-foreground/90">{ATLAS_ASK_MODEL}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <FormAlert>{error}</FormAlert> : null}
        {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}

        <p className="text-xs text-muted-foreground">
          Status:{" "}
          {settings.configured ? (
            <>
              <span className="text-foreground">Configured</span>
              {settings.hint ? (
                <span className="font-mono"> ({settings.hint})</span>
              ) : null}
            </>
          ) : (
            <span className="text-foreground">Not configured</span>
          )}
          {" · "}
          LLM chat {settings.enabled && settings.configured ? "enabled" : "off"}
        </p>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="ask-atlas-api-key">Atlas API key</FieldLabel>
            <Input
              id="ask-atlas-api-key"
              type="password"
              autoComplete="off"
              placeholder={
                settings.configured
                  ? "Leave blank to keep current key"
                  : "sk-…"
              }
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Stored in the website database. Env fallback:{" "}
              <code className="text-[0.65rem]">ATLASCLOUD_API_KEY</code>.
              Never shown again after save.
            </p>
          </Field>

          <Field orientation="horizontal">
            <Switch
              id="ask-llm-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <FieldLabel htmlFor="ask-llm-enabled" className="font-normal">
              Enable LLM chat (when a key is configured)
            </FieldLabel>
          </Field>
        </FieldGroup>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={saving || clearing}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!settings.configured || saving || clearing}
            onClick={() => void clearKey()}
          >
            {clearing ? "Clearing…" : "Clear key"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
