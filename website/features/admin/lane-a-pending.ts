"use client"

import { useCallback, useEffect, useState } from "react"

import { api } from "@/lib/kyClient"

export const LANE_A_PENDING_EVENT = "smt:lane-a-pending"

export type LaneAPendingClientStatus = {
  pending: boolean
  shopsDirty: boolean
  payoutsDirty: boolean
  reportRewardsDirty: boolean
}

export function notifyLaneAPendingChanged(): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(LANE_A_PENDING_EVENT))
}

export function useLaneAPending(pollMs = 12_000): LaneAPendingClientStatus {
  const [status, setStatus] = useState<LaneAPendingClientStatus>({
    pending: false,
    shopsDirty: false,
    payoutsDirty: false,
    reportRewardsDirty: false,
  })

  const refresh = useCallback(async () => {
    try {
      const response = await api.get("admin/ops/publish/lane-a/status")
      const json = (await response.json()) as {
        success?: boolean
        data?: LaneAPendingClientStatus
      }
      if (!response.ok || !json.success || !json.data) return
      setStatus({
        pending: Boolean(json.data.pending),
        shopsDirty: Boolean(json.data.shopsDirty),
        payoutsDirty: Boolean(json.data.payoutsDirty),
        reportRewardsDirty: Boolean(json.data.reportRewardsDirty),
      })
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
    window.addEventListener(LANE_A_PENDING_EVENT, onEvent)
    document.addEventListener("visibilitychange", onVis)
    const id = window.setInterval(() => void refresh(), pollMs)
    return () => {
      window.removeEventListener(LANE_A_PENDING_EVENT, onEvent)
      document.removeEventListener("visibilitychange", onVis)
      window.clearInterval(id)
    }
  }, [pollMs, refresh])

  return status
}
