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

type PreviewSlot = {
  mannequin: string
  iso: string | null
  bust: number
  pending: boolean
  error: string | null
}

const PREVIEW_ROLES = ["vam1", "vaf1"] as const

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
  const [previews, setPreviews] = useState<Record<string, PreviewSlot>>(() =>
    Object.fromEntries(
      PREVIEW_ROLES.map((m) => [
        m,
        { mannequin: m, iso: null, bust: 0, pending: false, error: null },
      ])
    )
  )

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

  const refreshPreviewMeta = useCallback(async () => {
    try {
      const response = await api("admin/studio/preview")
      const json = (await response.json()) as {
        success?: boolean
        data?: {
          previews?: Array<{
            mannequin: string
            iso: string | null
            hasImage?: boolean
          }>
        }
      }
      if (!response.ok || !json.success || !json.data?.previews) return
      setPreviews((prev) => {
        const next = { ...prev }
        for (const row of json.data!.previews!) {
          const cur = next[row.mannequin]
          if (!cur) continue
          next[row.mannequin] = {
            ...cur,
            iso: row.iso,
            bust: row.hasImage ? cur.bust || Date.now() : cur.bust,
          }
        }
        return next
      })
    } catch {
      /* ignore — previews optional */
    }
  }, [])

  useEffect(() => {
    void refreshHealth()
    void refreshPreviewMeta()
  }, [refreshHealth, refreshPreviewMeta])

  async function capturePreview(role: string) {
    setPreviews((prev) => ({
      ...prev,
      [role]: { ...prev[role], pending: true, error: null },
    }))
    try {
      const response = await api("admin/studio/preview", {
        method: "POST",
        json: { mannequin: role },
        timeout: 60000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { iso?: string; mannequin?: string }
      }
      if (!response.ok || !json.success) {
        setPreviews((prev) => ({
          ...prev,
          [role]: {
            ...prev[role],
            pending: false,
            error: json.message || `HTTP ${response.status}`,
          },
        }))
        return
      }
      setPreviews((prev) => ({
        ...prev,
        [role]: {
          ...prev[role],
          pending: false,
          error: null,
          iso: json.data?.iso ?? new Date().toISOString(),
          bust: Date.now(),
        },
      }))
      void refreshHealth()
    } catch (err) {
      setPreviews((prev) => ({
        ...prev,
        [role]: {
          ...prev[role],
          pending: false,
          error: err instanceof Error ? err.message : "Preview failed",
        },
      }))
    }
  }

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
    if (online === true) return `${name}: in-world`
    if (online === false) return `${name}: not in-world`
    return `${name}: ?`
  }

  return (
    <div className="mt-6 max-w-3xl space-y-4">
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

      <div className="border-2 border-border bg-card/60 p-4">
        <p className="text-sm font-medium">Remote preview</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Grabs the mannequin Wine window (studio crop). Website must run on the
          studio host. ~8s cooldown per mannequin.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {PREVIEW_ROLES.map((role) => {
            const slot = previews[role]
            const src =
              slot.bust > 0
                ? `/api/admin/studio/preview/${role}?t=${slot.bust}`
                : null
            return (
              <div key={role} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{role}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={slot.pending}
                    onClick={() => void capturePreview(role)}
                  >
                    {slot.pending ? "Capturing…" : "Snap"}
                  </Button>
                </div>
                {slot.iso && (
                  <p className="text-xs text-muted-foreground">{slot.iso}</p>
                )}
                {slot.error && (
                  <FormAlert variant="error">{slot.error}</FormAlert>
                )}
                <div className="flex min-h-40 items-center justify-center overflow-hidden border border-border bg-black/40">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={`${role} studio preview`}
                      className="max-h-72 w-full object-contain"
                    />
                  ) : (
                    <span className="px-2 py-8 text-xs text-muted-foreground">
                      No shot yet
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <form
        className="max-w-lg space-y-4 border-2 border-border bg-card/60 p-4"
        onSubmit={(e) => void onSubmit(e)}
      >
        <Field>
          <FieldLabel htmlFor="studio-mannequin">Mannequin</FieldLabel>
          <select
            id="studio-mannequin"
            className="h-8 w-full rounded-none border border-input bg-background px-2 text-sm"
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
            placeholder=""
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
          vaf1). Does not touch live clients.
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
