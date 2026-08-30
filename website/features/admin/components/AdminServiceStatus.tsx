"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Play, RotateCcw, Square } from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { api } from "@/lib/kyClient"

const SERVICES = ["lobby", "world", "channel"] as const
type ServiceName = (typeof SERVICES)[number]
type ServiceAction = "start" | "stop" | "restart"

const POLL_MS = 4000

type ProcessRow = {
  name: string
  running: boolean
  status?: string
  error?: string
}

type Tone = "online" | "offline" | "error" | "unknown"

function toneFor(proc: ProcessRow | undefined): Tone {
  if (!proc) return "unknown"
  if (proc.error) return "error"
  if (proc.running) return "online"
  return "offline"
}

function labelFor(tone: Tone): string {
  switch (tone) {
    case "online":
      return "online"
    case "offline":
      return "offline"
    case "error":
      return "error"
    default:
      return "…"
  }
}

const DOT: Record<Tone, string> = {
  online: "bg-emerald-500",
  offline: "bg-red-500",
  error: "bg-amber-500",
  unknown: "bg-muted-foreground/40",
}

/**
 * Lobby / world / channel presence for the Power panel.
 * Polls metrics; orange + message when Docker inspect reports a boot failure.
 * Per-row start / stop / restart controls.
 *
 * `workingAll` — parent bulk Start/Stop/Restart all is in flight.
 */
export function AdminServiceStatus({
  workingAll = false,
}: {
  workingAll?: boolean
} = {}) {
  const [rows, setRows] = useState<ProcessRow[] | null>(null)
  const [busy, setBusy] = useState<{
    service: ServiceName
    action: ServiceAction
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const response = await api("admin/ops/metrics")
      const json = (await response.json()) as {
        success?: boolean
        data?: { processes?: ProcessRow[] }
      }
      if (!response.ok || !json.success) return
      setRows(json.data?.processes ?? [])
    } catch {
      /* keep last good snapshot */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  const wasWorkingAll = useRef(false)
  useEffect(() => {
    if (wasWorkingAll.current && !workingAll) void refresh()
    wasWorkingAll.current = workingAll
  }, [workingAll, refresh])

  const runAction = useCallback(
    async (service: ServiceName, action: ServiceAction) => {
      setBusy({ service, action })
      setError(null)
      setOk(null)
      try {
        const response = await api.post("admin/ops/services", {
          json: { service, action },
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
        setOk(json.message || `${service} ${action} ok`)
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : `${action} failed`)
      } finally {
        setBusy(null)
      }
    },
    [refresh]
  )

  const byName = new Map((rows ?? []).map((p) => [p.name.toLowerCase(), p]))
  const anyBusy = busy !== null || workingAll

  return (
    <div className="mt-3 space-y-2">
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      {ok ? <FormAlert variant="success">{ok}</FormAlert> : null}
      <ul className="space-y-1.5">
        {SERVICES.map((name) => {
          const proc = byName.get(name)
          const tone = toneFor(proc)
          const online = tone === "online"
          const offline = tone === "offline" || tone === "error"
          const err = tone === "error" && proc?.error ? proc.error : null
          const rowBusy = busy?.service === name || workingAll
          return (
            <li
              key={name}
              className="flex flex-wrap items-center gap-x-2 gap-y-1"
            >
              <span
                className="w-3 shrink-0 text-center text-[0.65rem] tabular-nums text-muted-foreground/45"
                aria-hidden
              >
                {SERVICES.indexOf(name) + 1}
              </span>
              <span
                className={cn(
                  "inline-block size-2 shrink-0 rounded-full",
                  rowBusy ? "bg-amber-500 animate-pulse" : DOT[tone]
                )}
                aria-hidden
              />
              <span className="min-w-[4.5rem] text-xs font-medium text-foreground capitalize">
                {name}
              </span>
              <span
                className={cn(
                  "min-w-[3.5rem] text-xs",
                  rowBusy && "text-amber-600 dark:text-amber-400",
                  !rowBusy &&
                    tone === "online" &&
                    "text-emerald-600 dark:text-emerald-400",
                  !rowBusy &&
                    tone === "offline" &&
                    "text-red-600 dark:text-red-400",
                  !rowBusy &&
                    tone === "error" &&
                    "text-amber-700 dark:text-amber-400",
                  !rowBusy && tone === "unknown" && "text-muted-foreground"
                )}
              >
                {rowBusy ? "working" : labelFor(tone)}
              </span>
              <span className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title={`Start ${name}`}
                  aria-label={`Start ${name}`}
                  disabled={
                    anyBusy || online || tone === "unknown"
                  }
                  onClick={() => void runAction(name, "start")}
                >
                  <Play
                    className={cn(
                      rowBusy && busy?.action === "start" && "animate-pulse"
                    )}
                  />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title={`Stop ${name}`}
                  aria-label={`Stop ${name}`}
                  disabled={anyBusy || offline || tone === "unknown"}
                  onClick={() => void runAction(name, "stop")}
                >
                  <Square
                    className={cn(
                      rowBusy && busy?.action === "stop" && "animate-pulse"
                    )}
                  />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title={`Restart ${name}`}
                  aria-label={`Restart ${name}`}
                  disabled={anyBusy || tone === "unknown"}
                  onClick={() => void runAction(name, "restart")}
                >
                  <RotateCcw
                    className={cn(
                      rowBusy &&
                        busy?.action === "restart" &&
                        "animate-spin"
                    )}
                  />
                </Button>
              </span>
              {err ? (
                <span className="w-full pl-4 text-[0.7rem] text-amber-800 dark:text-amber-300/90">
                  {err}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
