import { notifyLaneAPendingChanged } from "@/features/admin/lane-a-pending"
import {
  applyAdminConfigPublish,
  validateAdminConfigPublish,
} from "@/features/admin-config/api"
import { fetcher } from "@/lib/fetcher"
import type {
  AdminEventsResponse,
  EventScheduleConfig,
  EventScheduleStatus,
  UpdateEventsRequest,
  UpdateEventsResponse,
} from "@/lib/events/types"

export const fetchAdminEvents = () =>
  fetcher<AdminEventsResponse>("admin/events")

export const fetchAdminEventSchedule = () =>
  fetcher<EventScheduleStatus>("admin/events/schedule")

export async function updateAdminEventSchedule(
  config: EventScheduleConfig
): Promise<EventScheduleStatus> {
  const result = await fetcher<EventScheduleStatus>("admin/events/schedule", {
    method: "PUT",
    json: config,
  })
  notifyLaneAPendingChanged()
  return result
}

export async function updateAdminEvents(
  payload: UpdateEventsRequest
): Promise<UpdateEventsResponse> {
  const result = await fetcher<UpdateEventsResponse>("admin/events", {
    method: "PUT",
    json: payload,
  })
  notifyLaneAPendingChanged()
  return result
}

export async function publishAndRestartChannel() {
  const validation = await validateAdminConfigPublish(["channel"])
  if (!validation.ok || !validation.releaseId) {
    const errorMsg =
      validation.errors?.join(", ") ||
      validation.error ||
      "Configuration validation failed"
    throw new Error(errorMsg)
  }
  const result = await applyAdminConfigPublish(validation.releaseId, true)
  notifyLaneAPendingChanged()
  return result
}

/** Overview / schedule: sync desired events if needed, then restart channel. */
export async function restartChannelWithScheduleSync() {
  const result = await fetcher<unknown>("admin/ops/restart/channel", {
    method: "POST",
  })
  notifyLaneAPendingChanged()
  return result
}
