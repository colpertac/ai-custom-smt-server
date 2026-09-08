"use client"

import { useCallback, useEffect, useState } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/kyClient"
import { cn } from "@/lib/utils"

type Tunables = {
  splashEscCount: number
  splashEscGapSec: number
  splashSettleSec: number
  afterEnterSec: number
  fieldGapSec: number
  typeDelayMs: number
  startXFrac: number
  startYFrac: number
  startClickCount: number
  startClickGapSec: number
  startClickJitterPx: number
  afterLaunchSec: number
  onlineTimeoutSec: number
  loginRetries: number
  charSelectSec: number
  debugScreenshots: boolean
}

type ShotMeta = {
  id: string
  role: string
  step: string
  createdAt: number
  bytes: number
}

const FIELD_META: {
  key: keyof Omit<Tunables, "debugScreenshots">
  label: string
  step?: string
}[] = [
  { key: "splashEscCount", label: "Splash Esc presses", step: "1" },
  { key: "splashEscGapSec", label: "Gap between Esc (s)", step: "0.1" },
  { key: "splashSettleSec", label: "Splash settle wait (s)", step: "0.1" },
  { key: "afterEnterSec", label: "Wait after login Enter (s)", step: "0.5" },
  {
    key: "fieldGapSec",
    label: "Gap after Tab / Shift+Tab (s)",
    step: "0.05",
  },
  { key: "typeDelayMs", label: "Type delay per char (ms)", step: "1" },
  { key: "startXFrac", label: "Start Game X (0–1)", step: "0.001" },
  { key: "startYFrac", label: "Start Game Y (0–1)", step: "0.001" },
  { key: "startClickCount", label: "Start Game click count", step: "1" },
  { key: "startClickGapSec", label: "Click gap (s)", step: "0.05" },
  { key: "startClickJitterPx", label: "Click jitter (px)", step: "1" },
  { key: "afterLaunchSec", label: "Wait after client launch (s)", step: "0.5" },
  { key: "onlineTimeoutSec", label: "In-world wait timeout (s)", step: "1" },
  { key: "loginRetries", label: "Login retries", step: "1" },
  { key: "charSelectSec", label: "Char-select settle (s)", step: "0.5" },
]

export function StudioLoginDebugPanel({
  className,
  galleryClassName,
}: {
  className?: string
  galleryClassName?: string
} = {}) {
  const [tunables, setTunables] = useState<Tunables | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [shots, setShots] = useState<ShotMeta[]>([])
  const [shotsLoading, setShotsLoading] = useState(false)
  const [snapping, setSnapping] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<ShotMeta | null>(null)

  const refreshTunables = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api("admin/studio/login-tunables")
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { tunables?: Tunables }
      }
      if (!response.ok || !json.success || !json.data?.tunables) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setTunables(json.data.tunables)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tunables")
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshShots = useCallback(async () => {
    setShotsLoading(true)
    try {
      const response = await api("admin/studio/debug/screenshots")
      const json = (await response.json()) as {
        success?: boolean
        data?: { screenshots?: ShotMeta[] }
      }
      if (!response.ok || !json.success) return
      setShots(json.data?.screenshots ?? [])
    } catch {
      /* optional */
    } finally {
      setShotsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshTunables()
    void refreshShots()
  }, [refreshTunables, refreshShots])

  async function save() {
    if (!tunables) return
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.put("admin/studio/login-tunables", {
        json: tunables,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { tunables?: Tunables }
      }
      if (!response.ok || !json.success || !json.data?.tunables) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setTunables(json.data.tunables)
      setOk(
        json.message ||
          "Saved — Wine host picks these up on next ./studio up / login"
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  function setNum(key: keyof Tunables, raw: string) {
    setTunables((prev) => {
      if (!prev) return prev
      const n = Number(raw)
      if (!Number.isFinite(n)) return prev
      return { ...prev, [key]: n }
    })
  }

  async function remoteSnap(role: "vam1" | "vaf1") {
    setSnapping(role)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/studio/debug/screenshot", {
        json: { role, step: "admin" },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      setOk(json.message || `Captured ${role}`)
      await refreshShots()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remote snap failed")
    } finally {
      setSnapping(null)
    }
  }

  return (
    <div
      className={cn(
        "border border-border bg-card/60 p-3 space-y-3 h-full",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Login tunables</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Applied on next client start / login pull.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || shotsLoading}
          onClick={() => {
            void refreshTunables()
            void refreshShots()
          }}
        >
          Reload
        </Button>
      </div>

      {error && <FormAlert variant="error">{error}</FormAlert>}
      {ok && <FormAlert variant="success">{ok}</FormAlert>}

      {tunables && (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {FIELD_META.map(({ key, label, step }) => (
              <Field key={key} className="gap-1">
                <FieldLabel
                  htmlFor={`login-${key}`}
                  className="text-[11px] text-muted-foreground"
                >
                  {label}
                </FieldLabel>
                <Input
                  id={`login-${key}`}
                  type="number"
                  step={step}
                  value={tunables[key]}
                  onChange={(e) => setNum(key, e.target.value)}
                  className="h-8 font-mono text-xs"
                />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={tunables.debugScreenshots}
                onChange={(e) =>
                  setTunables((prev) =>
                    prev
                      ? { ...prev, debugScreenshots: e.target.checked }
                      : prev
                  )
                }
              />
              Auto debug screenshots
            </label>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save tunables"}
            </Button>
          </div>
        </>
      )}

      <div
        className={cn(
          "space-y-2 pt-2 border-t border-border/60",
          galleryClassName
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Debug screenshots</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={snapping !== null}
              onClick={() => void remoteSnap("vam1")}
            >
              {snapping === "vam1" ? "…" : "Snap vam1"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={snapping !== null}
              onClick={() => void remoteSnap("vaf1")}
            >
              {snapping === "vaf1" ? "…" : "Snap vaf1"}
            </Button>
          </div>
        </div>
        {shots.length === 0 ? (
          <p className="text-xs text-muted-foreground">No screenshots yet.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shots.slice(0, 12).map((s) => {
              const isMale = s.role.startsWith("vam")
              const roleBorder = isMale
                ? "border-sky-500/55 hover:border-sky-400/80"
                : "border-pink-500/55 hover:border-pink-400/80"
              const roleTint = isMale
                ? "bg-sky-500/[0.06]"
                : "bg-pink-500/[0.06]"
              return (
                <button
                  key={s.id}
                  type="button"
                  className={cn(
                    "border p-1.5 space-y-1 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    roleBorder,
                    roleTint
                  )}
                  onClick={() => setLightbox(s)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/admin/studio/debug/screenshots/${encodeURIComponent(s.id)}`}
                    alt={`${s.role} ${s.step}`}
                    className="w-full h-auto max-h-40 object-contain bg-black/40"
                  />
                  <span
                    className={cn(
                      "block text-[10px] font-mono truncate",
                      isMale ? "text-sky-400/90" : "text-pink-400/90"
                    )}
                  >
                    {s.role} · {s.step} ·{" "}
                    {new Date(s.createdAt).toLocaleString()}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <Dialog
        open={lightbox != null}
        onOpenChange={(open) => {
          if (!open) setLightbox(null)
        }}
      >
        <DialogContent
          className={cn(
            "sm:max-w-[min(96vw,1100px)] p-3 gap-2 border",
            lightbox?.role.startsWith("vam")
              ? "border-sky-500/50"
              : lightbox
                ? "border-pink-500/50"
                : undefined
          )}
        >
          <DialogHeader className="pr-8">
            <DialogTitle
              className={cn(
                "font-mono text-xs",
                lightbox?.role.startsWith("vam")
                  ? "text-sky-400"
                  : lightbox
                    ? "text-pink-400"
                    : undefined
              )}
            >
              {lightbox
                ? `${lightbox.role} · ${lightbox.step}`
                : "Debug screenshot"}
            </DialogTitle>
            {lightbox ? (
              <DialogDescription className="font-mono text-[11px]">
                {new Date(lightbox.createdAt).toLocaleString()} · {lightbox.id}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          {lightbox ? (
            <div
              className={cn(
                "flex max-h-[min(80vh,900px)] items-center justify-center overflow-auto",
                lightbox.role.startsWith("vam")
                  ? "bg-sky-950/40"
                  : "bg-pink-950/40"
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/admin/studio/debug/screenshots/${encodeURIComponent(lightbox.id)}`}
                alt={`${lightbox.role} ${lightbox.step}`}
                className="max-h-[min(80vh,900px)] w-auto max-w-full object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
