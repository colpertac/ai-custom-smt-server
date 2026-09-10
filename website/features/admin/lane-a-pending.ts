"use client"

import { useCallback, useEffect, useState } from "react"

import { api } from "@/lib/kyClient"

export const LANE_A_PENDING_EVENT = "smt:lane-a-pending"

export type LaneAPendingClientStatus = {
  pending: boolean
  shopsDirty: boolean
  payoutsDirty: boolean
  reportRewardsDirty: boolean
  channelDirty: boolean
  eventsSchedulePending: boolean
  goldenApplesDirty: boolean
  casinoDirty: boolean
}

let notifyTimer: number | null = null

/** Coalesce rapid autosave notifications so Overview status isn't spammed. */
export function notifyLaneAPendingChanged(): void {
  if (typeof window === "undefined") return
  if (notifyTimer !== null) window.clearTimeout(notifyTimer)
  notifyTimer = window.setTimeout(() => {
    notifyTimer = null
    window.dispatchEvent(new Event(LANE_A_PENDING_EVENT))
  }, 750)
}

export function useLaneAPending(pollMs = 12_000): LaneAPendingClientStatus {
  const [status, setStatus] = useState<LaneAPendingClientStatus>({
    pending: false,
    shopsDirty: false,
    payoutsDirty: false,
    reportRewardsDirty: false,
    channelDirty: false,
    eventsSchedulePending: false,
    goldenApplesDirty: false,
    casinoDirty: false,
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
        channelDirty: Boolean(json.data.channelDirty),
        eventsSchedulePending: Boolean(json.data.eventsSchedulePending),
        goldenApplesDirty: Boolean(json.data.goldenApplesDirty),
        casinoDirty: Boolean(json.data.casinoDirty),
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
