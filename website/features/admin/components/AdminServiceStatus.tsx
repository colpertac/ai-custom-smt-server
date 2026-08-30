"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Play, RotateCcw, ScrollText, Square } from "lucide-react"

import { FormAlert } from "@/components/form-alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  logSummary?: string
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
 * Per-row start / stop / restart controls + log viewer.
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
  const [logService, setLogService] = useState<ServiceName | null>(null)
  const [logText, setLogText] = useState<string>("")
  const [logSummary, setLogSummary] = useState<string | null>(null)
  const [logLoading, setLogLoading] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)

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

  const openLogs = useCallback(async (service: ServiceName) => {
    setLogService(service)
    setLogLoading(true)
    setLogError(null)
    setLogText("")
    setLogSummary(null)
    try {
      const response = await api.get("admin/ops/logs", {
        searchParams: { service, lines: "120" },
      })
      const json = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { text?: string; summary?: string }
      }
      if (!response.ok || !json.success) {
        setLogError(json.message || `HTTP ${response.status}`)
        return
      }
      setLogText(json.data?.text || "(empty log)")
      setLogSummary(json.data?.summary ?? null)
    } catch (e) {
      setLogError(e instanceof Error ? e.message : "Failed to load logs")
    } finally {
      setLogLoading(false)
    }
  }, [])

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
          await refresh()
          // After a failed start/restart, open logs so the CRITICAL/ERROR is visible.
          if (action === "start" || action === "restart") {
            void openLogs(service)
          }
          return
        }
        setOk(json.message || `${service} ${action} ok`)
        await refresh()
        // If we started/restarted but it is still offline after refresh, show logs.
        if (action === "start" || action === "restart") {
          try {
            const metricsRes = await api("admin/ops/metrics")
            const metricsJson = (await metricsRes.json()) as {
              success?: boolean
              data?: { processes?: ProcessRow[] }
            }
            const proc = metricsJson.data?.processes?.find(
              (p) => p.name.toLowerCase() === service
            )
            if (proc && !proc.running) {
              setError(
                `${service} exited after ${action}` +
                  (proc.logSummary ? ` — ${proc.logSummary}` : "")
              )
              void openLogs(service)
            }
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : `${action} failed`)
      } finally {
        setBusy(null)
      }
    },
    [refresh, openLogs]
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
          const hint =
            !online && proc?.logSummary
              ? proc.logSummary
              : err
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
                  disabled={anyBusy || online || tone === "unknown"}
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title={`View ${name} logs`}
                  aria-label={`View ${name} logs`}
                  disabled={anyBusy}
                  onClick={() => void openLogs(name)}
                >
                  <ScrollText />
                </Button>
              </span>
              {hint ? (
                <span className="w-full pl-4 text-[0.7rem] text-amber-800 dark:text-amber-300/90 break-all">
                  {hint}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>

      <Dialog
        open={logService != null}
        onOpenChange={(open) => {
          if (!open) setLogService(null)
        }}
      >
        <DialogContent
          className={cn(
            "flex max-h-[min(90dvh,calc(100vh-2rem))] w-full max-w-3xl flex-col gap-3 overflow-hidden sm:max-w-3xl"
          )}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="capitalize">
              {logService} logs
            </DialogTitle>
            <DialogDescription className="line-clamp-3 break-all">
              {logSummary
                ? logSummary
                : "Recent lines from the service log (CRITICAL/ERROR called out in the summary when present)."}
            </DialogDescription>
          </DialogHeader>
          {logLoading ? (
            <p className="shrink-0 text-sm text-muted-foreground">Loading…</p>
          ) : logError ? (
            <FormAlert variant="error">{logError}</FormAlert>
          ) : (
            <pre className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border border-border/60 bg-muted/30 p-3 text-[0.7rem] leading-relaxed whitespace-pre-wrap break-all font-mono">
              {logText}
            </pre>
          )}
          <div className="flex shrink-0 justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!logService || logLoading}
              onClick={() => logService && void openLogs(logService)}
            >
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setLogService(null)}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
