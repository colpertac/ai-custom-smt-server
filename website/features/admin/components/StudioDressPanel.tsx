"use client"

import { useCallback, useEffect, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/kyClient"

type Health = {
  ok: boolean
  vam1?: boolean
  vaf1?: boolean
  vam?: boolean
  vaf?: boolean
  va?: boolean
  error?: string
}

export function StudioDressPanel() {
  const [mannequin, setMannequin] = useState("vam1")
  const [source, setSource] = useState("")
  const [pose, setPose] = useState(true)
  const [health, setHealth] = useState<Health | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const refreshHealth = useCallback(async () => {
    setRefreshing(true)
    setHealthError(null)
    try {
      const response = await api("admin/studio/health")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: Health
      }
      if (!response.ok || !json.success || !json.data) {
        setHealth(null)
        setHealthError(json.message || `HTTP ${response.status}`)
        return
      }
      setHealth(json.data)
    } catch (err) {
      setHealth(null)
      setHealthError(err instanceof Error ? err.message : "Health failed")
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refreshHealth()
  }, [refreshHealth])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)
    if (!source.trim()) {
      setError("Enter a source character name.")
      return
    }
    setPending(true)
    try {
      const response = await api("admin/studio/dress", {
        method: "POST",
        json: {
          mannequin: mannequin.trim(),
          source: source.trim(),
          pose,
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
      setOk(json.message || "Dress applied.")
      void refreshHealth()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dress failed")
    } finally {
      setPending(false)
    }
  }

  function onlineLabel(name: string, online?: boolean) {
    if (online === true) return `${name}: online`
    if (online === false) return `${name}: offline`
    return `${name}: ?`
  }

  return (
    <div className="mt-6 max-w-lg space-y-4">
      <div className="border-2 border-border bg-card/60 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Mannequin status</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={refreshing}
            onClick={() => void refreshHealth()}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        {healthError && (
          <FormAlert variant="error" className="mt-3">
            {healthError}
          </FormAlert>
        )}
        {health && (
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            <li
              className={
                health.vam1 || health.vam ? "text-foreground" : undefined
              }
            >
              {onlineLabel("vam1", health.vam1 ?? health.vam)}
            </li>
            <li
              className={
                health.vaf1 || health.vaf ? "text-foreground" : undefined
              }
            >
              {onlineLabel("vaf1", health.vaf1 ?? health.vaf)}
            </li>
          </ul>
        )}
      </div>

      <form
        className="space-y-4 border-2 border-border bg-card/60 p-4"
        onSubmit={(e) => void onSubmit(e)}
      >
        <Field>
          <FieldLabel htmlFor="studio-mannequin">Mannequin</FieldLabel>
          <select
            id="studio-mannequin"
            className="border-input bg-background h-8 w-full rounded-none border px-2 text-sm"
            value={mannequin}
            onChange={(e) => setMannequin(e.target.value)}
          >
            <option value="vam1">vam1 (male)</option>
            <option value="vaf1">vaf1 (female)</option>
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="studio-source">Source character</FieldLabel>
          <Input
            id="studio-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="catm"
            autoComplete="off"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={pose}
            onChange={(e) => setPose(e.target.checked)}
            className="size-4 rounded-none"
          />
          Pose in studio (zone 10105 — vam1 @ 50000,50000 / vaf1 @
          -50000,-50000)
        </label>
        <p className="text-xs text-muted-foreground">
          Mannequin must be logged in. Gender must match (male → vam1, female →
          vaf1). Does not touch live cat/catm clients.
        </p>
        {error && <FormAlert variant="error">{error}</FormAlert>}
        {ok && <FormAlert variant="success">{ok}</FormAlert>}
        <Button type="submit" size="sm" disabled={pending || !source.trim()}>
          {pending ? "Dressing…" : "Dress mannequin"}
        </Button>
      </form>
    </div>
  )
}
