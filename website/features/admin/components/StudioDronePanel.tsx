"use client"

import { useCallback, useEffect, useState, type MouseEvent } from "react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/kyClient"
import {
  containClickToFrac,
  formatClickFrac,
  fracToContainPercent,
  type ClickFrac,
} from "@/lib/studio-drone-click"
import { cn } from "@/lib/utils"

type Role = "vam1" | "vaf1"

type ShotMeta = {
  id: string
  role: string
  step: string
  createdAt: number
  bytes: number
}

type QueueItem = {
  id: string
  op: "click" | "type" | "key" | "wait"
  xFrac?: number
  yFrac?: number
  text?: string
  name?: string
  sec?: number
}

const KEYS: { name: string; label: string }[] = [
  { name: "Escape", label: "Esc" },
  { name: "Tab", label: "Tab" },
  { name: "Shift+Tab", label: "Shift+Tab" },
  { name: "Return", label: "Enter" },
  { name: "BackSpace", label: "Bksp" },
  { name: "s", label: "Hold S" },
  { name: "Home", label: "Home" },
  { name: "Prior", label: "PageUp" },
]

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

const LOGIN_KEYS = new Set([
  "Escape",
  "Tab",
  "Shift+Tab",
  "Return",
  "BackSpace",
])

function queueNeedsLoginClick(items: QueueItem[]): boolean {
  let sawClick = false
  for (const item of items) {
    if (item.op === "click") sawClick = true
    if (item.op === "type" && !sawClick) return true
    if (item.op === "key" && !sawClick && LOGIN_KEYS.has(item.name ?? "")) {
      return true
    }
  }
  return false
}

function queueLabel(item: QueueItem): string {
  if (item.op === "click" && item.xFrac != null && item.yFrac != null) {
    return `click ${formatClickFrac({ xFrac: item.xFrac, yFrac: item.yFrac })}`
  }
  if (item.op === "type") {
    const n = item.text?.length ?? 0
    return `type ${n} char${n === 1 ? "" : "s"}`
  }
  if (item.op === "key") return `key ${item.name}`
  if (item.op === "wait") return `wait ${item.sec}s`
  return item.op
}

function toAction(item: QueueItem): Record<string, unknown> {
  if (item.op === "click") {
    return { op: "click", xFrac: item.xFrac, yFrac: item.yFrac }
  }
  if (item.op === "type") return { op: "type", text: item.text }
  if (item.op === "key") return { op: "key", name: item.name }
  return { op: "wait", sec: item.sec }
}

export function StudioDronePanel({ className }: { className?: string }) {
  const [role, setRole] = useState<Role>("vam1")
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [typeDraft, setTypeDraft] = useState("")
  const [shot, setShot] = useState<ShotMeta | null>(null)
  const [lastClick, setLastClick] = useState<ClickFrac | null>(null)
  const [crosshairPct, setCrosshairPct] = useState<{
    leftPct: number
    topPct: number
  } | null>(null)
  const [snapping, setSnapping] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const applyShot = useCallback((meta: ShotMeta | null) => {
    setShot(meta)
    setLastClick(null)
    setCrosshairPct(null)
  }, [])

  const refreshLatestShot = useCallback(async () => {
    try {
      const response = await api("admin/studio/debug/screenshots")
      const json = (await response.json()) as {
        success?: boolean
        data?: { screenshots?: ShotMeta[] }
      }
      if (!response.ok || !json.success) return
      const next = (json.data?.screenshots ?? []).find((s) => s.role === role)
      if (next) applyShot(next)
    } catch {
      /* optional */
    }
  }, [applyShot, role])

  useEffect(() => {
    void refreshLatestShot()
  }, [refreshLatestShot])

  async function snap() {
    setSnapping(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/studio/debug/screenshot", {
        json: { role, step: "drone" },
        timeout: 45_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { screenshot?: ShotMeta }
      }
      if (!response.ok || !json.success || !json.data?.screenshot) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      applyShot(json.data.screenshot)
      setOk(`Snap ${role}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Snap failed")
    } finally {
      setSnapping(false)
    }
  }

  function queueClick(e: MouseEvent<HTMLImageElement>) {
    const img = e.currentTarget
    const frac = containClickToFrac(e.nativeEvent.offsetX, e.nativeEvent.offsetY, {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      clientWidth: img.clientWidth,
      clientHeight: img.clientHeight,
    })
    if (!frac) return
    setLastClick(frac)
    const pct = fracToContainPercent(frac, {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      clientWidth: img.clientWidth,
      clientHeight: img.clientHeight,
    })
    setCrosshairPct(pct)
    setQueue((prev) => [
      ...prev,
      { id: newId(), op: "click", xFrac: frac.xFrac, yFrac: frac.yFrac },
    ])
  }

  function addType() {
    const text = typeDraft
    if (!text) return
    setQueue((prev) => [...prev, { id: newId(), op: "type", text }])
    setTypeDraft("")
  }

  function addKey(name: string) {
    setQueue((prev) => [...prev, { id: newId(), op: "key", name }])
  }

  function addWait(sec: number) {
    setQueue((prev) => [...prev, { id: newId(), op: "wait", sec }])
  }

  function addCameraSetup() {
    setQueue((prev) => [
      ...prev,
      { id: newId(), op: "key", name: "Home" },
      { id: newId(), op: "wait", sec: 0.2 },
      { id: newId(), op: "key", name: "Prior" },
    ])
  }

  function moveItem(id: string, dir: -1 | 1) {
    setQueue((prev) => {
      const i = prev.findIndex((x) => x.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const tmp = next[i]
      next[i] = next[j]
      next[j] = tmp
      return next
    })
  }

  async function run(items: QueueItem[], clearAll: boolean) {
    if (items.length === 0) return
    setRunning(true)
    setError(null)
    setOk(null)
    try {
      const response = await api.post("admin/studio/drone", {
        json: {
          role,
          snapAfter: true,
          actions: items.map(toAction),
        },
        timeout: 120_000,
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { screenshot?: ShotMeta; result?: { elapsedSec?: number } }
      }
      if (!response.ok || !json.success) {
        setError(json.message || `HTTP ${response.status}`)
        return
      }
      if (json.data?.screenshot) {
        applyShot(json.data.screenshot)
      } else {
        await refreshLatestShot()
      }
      setOk(json.message || "Drone finished")
      setQueue((prev) => {
        if (clearAll) return []
        const ids = new Set(items.map((x) => x.id))
        return prev.filter((x) => !ids.has(x.id))
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Drone failed")
    } finally {
      setRunning(false)
    }
  }

  const imgSrc = shot
    ? `/api/admin/studio/debug/screenshots/${encodeURIComponent(shot.id)}?t=${shot.createdAt}`
    : null
  const male = role === "vam1"
  const busy = snapping || running

  return (
    <div
      className={cn(
        "border border-border bg-card/60 p-3 space-y-3",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Drone</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Snap the window, click the photo to queue clicks, add type/keys,
            then Run. After Run, a new snap is uploaded here. Not a live
            stream.
          </p>
          <p className="text-xs text-amber-400/90 mt-1.5">
            Login: click the username or password box on the snap before any
            key or type. Alt-tab / losing focus kills the field cursor; a
            click puts it back. Shift+Tab alone will look like a no-op.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(["vam1", "vaf1"] as const).map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={role === r ? "default" : "outline"}
              className={cn(
                "font-mono",
                role === r && r === "vam1" && "bg-sky-600 hover:bg-sky-600",
                role === r && r === "vaf1" && "bg-pink-600 hover:bg-pink-600"
              )}
              disabled={busy}
              onClick={() => {
                setRole(r)
                setLastClick(null)
                setCrosshairPct(null)
              }}
            >
              {r}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void snap()}
          >
            {snapping ? "…" : `Snap ${role}`}
          </Button>
        </div>
      </div>

      {error && <FormAlert variant="error">{error}</FormAlert>}
      {ok && <FormAlert variant="success">{ok}</FormAlert>}
      {queueNeedsLoginClick(queue) ? (
        <FormAlert variant="warning">
          This queue types or sends keys before a click. On the login screen
          the field cursor is off until you click a box — add a click on
          username or password, then the key/type.
        </FormAlert>
      ) : null}

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div
          className={cn(
            "relative flex h-[min(56vh,420px)] w-full items-center justify-center overflow-hidden border bg-black/50",
            male ? "border-sky-500/40" : "border-pink-500/40"
          )}
        >
          {imgSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgSrc}
                alt={`${role} drone snap`}
                className="h-full w-full cursor-crosshair object-contain"
                onClick={queueClick}
              />
              {crosshairPct ? (
                <span
                  className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 border-2 border-amber-400 bg-amber-400/20"
                  style={{
                    left: `${crosshairPct.leftPct}%`,
                    top: `${crosshairPct.topPct}%`,
                  }}
                />
              ) : null}
            </>
          ) : (
            <span className="px-3 py-16 text-xs text-muted-foreground">
              Snap {role} first, then click the photo to queue a click.
            </span>
          )}
        </div>

        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap gap-1">
            {KEYS.map((k) => (
              <Button
                key={k.name}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                disabled={busy}
                onClick={() => addKey(k.name)}
              >
                {k.label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              title="Hold Home, then PageUp (in-world camera framing)"
              onClick={addCameraSetup}
            >
              Cam Home+PgUp
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              onClick={() => addWait(1)}
            >
              Wait 1s
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              disabled={busy}
              onClick={() => addWait(2)}
            >
              Wait 2s
            </Button>
          </div>

          <Field>
            <FieldLabel htmlFor="studio-drone-type" className="text-[11px]">
              Type into clicked field
              <span className="font-normal text-muted-foreground">
                {" "}
                (queue a click first — Add, then Run)
              </span>
            </FieldLabel>
            <div className="flex gap-1.5">
              <Input
                id="studio-drone-type"
                value={typeDraft}
                onChange={(e) => setTypeDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addType()
                  }
                }}
                placeholder="vam1vam1"
                className="h-8 font-mono text-xs"
                disabled={busy}
                autoComplete="off"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !typeDraft}
                onClick={addType}
              >
                Add
              </Button>
            </div>
          </Field>

          {lastClick ? (
            <p className="font-mono text-[11px] text-amber-400/90">
              last click {formatClickFrac(lastClick)}
            </p>
          ) : null}

          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              Queue ({queue.length})
            </p>
            {queue.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Empty.</p>
            ) : (
              <ol className="max-h-56 space-y-1 overflow-auto">
                {queue.map((item, i) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-1 border border-border/60 bg-background/40 px-1.5 py-1"
                  >
                    <span className="w-4 shrink-0 text-[10px] text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                      {queueLabel(item)}
                    </span>
                    <button
                      type="button"
                      className="px-1 text-[10px] text-muted-foreground hover:text-foreground"
                      disabled={busy || i === 0}
                      onClick={() => moveItem(item.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="px-1 text-[10px] text-muted-foreground hover:text-foreground"
                      disabled={busy || i === queue.length - 1}
                      onClick={() => moveItem(item.id, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="px-1 text-[10px] text-muted-foreground hover:text-destructive"
                      disabled={busy}
                      onClick={() =>
                        setQueue((prev) => prev.filter((x) => x.id !== item.id))
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              size="sm"
              disabled={busy || queue.length === 0}
              onClick={() => void run(queue, true)}
            >
              {running ? "Running…" : "Run queue"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || queue.length === 0}
              onClick={() => void run(queue.slice(0, 1), false)}
            >
              Run next
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || queue.length === 0}
              onClick={() => setQueue([])}
            >
              Clear
            </Button>
          </div>

          {shot ? (
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {shot.role} · {shot.step} ·{" "}
              {new Date(shot.createdAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
