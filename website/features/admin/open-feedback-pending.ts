"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { api } from "@/lib/kyClient"

export const OPEN_FEEDBACK_PENDING_EVENT = "smt:open-feedback-pending"

export type OpenFeedbackPendingStatus = {
  pending: boolean
}

export function notifyOpenFeedbackPendingChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(OPEN_FEEDBACK_PENDING_EVENT))
}

export function useOpenFeedbackPending(
  pollMs = 12_000
): OpenFeedbackPendingStatus {
  const [status, setStatus] = useState<OpenFeedbackPendingStatus>({
    pending: false,
  })
  const failStreak = useRef(0)
  const nextAllowedAt = useRef(0)

  const refresh = useCallback(async () => {
    if (Date.now() < nextAllowedAt.current) return
    try {
      const response = await api.get("admin/feedback?status=open")
      const json = (await response.json()) as {
        success?: boolean
        data?: { items?: unknown[] }
      }
      if (!response.ok || !json.success) {
        failStreak.current = Math.min(failStreak.current + 1, 5)
        nextAllowedAt.current =
          Date.now() + Math.min(60_000, pollMs * 2 ** failStreak.current)
        return
      }
      failStreak.current = 0
      nextAllowedAt.current = 0
      setStatus({ pending: (json.data?.items?.length ?? 0) > 0 })
    } catch {
      failStreak.current = Math.min(failStreak.current + 1, 5)
      nextAllowedAt.current =
        Date.now() + Math.min(60_000, pollMs * 2 ** failStreak.current)
    }
  }, [pollMs])

  useEffect(() => {
    void refresh()
    const onEvent = () => void refresh()
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    window.addEventListener(OPEN_FEEDBACK_PENDING_EVENT, onEvent)
    document.addEventListener("visibilitychange", onVis)
    const id = window.setInterval(() => void refresh(), pollMs)
    return () => {
      window.removeEventListener(OPEN_FEEDBACK_PENDING_EVENT, onEvent)
      document.removeEventListener("visibilitychange", onVis)
      window.clearInterval(id)
    }
  }, [pollMs, refresh])

  return status
}
