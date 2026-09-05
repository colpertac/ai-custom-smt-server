"use client"

import { useCallback, useEffect, useState } from "react"

import { api } from "@/lib/kyClient"

export const OPEN_REPORTS_PENDING_EVENT = "smt:open-reports-pending"

export type OpenReportsPendingStatus = {
  pending: boolean
}

export function notifyOpenReportsPendingChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(OPEN_REPORTS_PENDING_EVENT))
}

export function useOpenReportsPending(
  pollMs = 12_000
): OpenReportsPendingStatus {
  const [status, setStatus] = useState<OpenReportsPendingStatus>({
    pending: false,
  })

  const refresh = useCallback(async () => {
    try {
      const response = await api.post("admin/reports", {
        json: { resolved: false, limit: 1 },
      })
      const json = (await response.json()) as {
        success?: boolean
        data?: { reports?: unknown[] }
      }
      if (!response.ok || !json.success) return
      setStatus({ pending: (json.data?.reports?.length ?? 0) > 0 })
    } catch {
      /* ignore transient errors */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onEvent = () => void refresh()
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    window.addEventListener(OPEN_REPORTS_PENDING_EVENT, onEvent)
    document.addEventListener("visibilitychange", onVis)
    const id = window.setInterval(() => void refresh(), pollMs)
    return () => {
      window.removeEventListener(OPEN_REPORTS_PENDING_EVENT, onEvent)
      document.removeEventListener("visibilitychange", onVis)
      window.clearInterval(id)
    }
  }, [pollMs, refresh])

  return status
}
