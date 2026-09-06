import { NextResponse } from "next/server"

import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { requireWebSession } from "@/lib/web-session"
import { conflictsInActiveSet } from "@/lib/events/event-conflicts"
import {
  getEventSchedule,
  loadConflictGroups,
} from "@/lib/events/event-schedule-fs"
import {
  getActiveEventIdsFromChannel,
  getEventsAdminStatus,
  updateActiveEvents,
} from "@/lib/events/events-fs"
import type { UpdateEventsRequest } from "@/lib/events/types"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const data = await getEventsAdminStatus()
    return apiOk(data)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to load events status",
      500,
      "EVENTS"
    )
  }
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation("admin-events-update", 60, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: UpdateEventsRequest
  try {
    body = (await request.json()) as UpdateEventsRequest
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  try {
    const schedule = await getEventSchedule()
    if (schedule.enabled) {
      return apiFail(
        "Schedule mode is on — switch to Manual mode to edit event toggles directly.",
        409,
        "SCHEDULE_OWNS_EVENTS"
      )
    }

    let nextActiveIds: string[]

    if (Array.isArray(body.activeIds)) {
      nextActiveIds = body.activeIds
    } else if (typeof body.eventId === "string" && typeof body.enabled === "boolean") {
      const current = await getActiveEventIdsFromChannel()
      const set = new Set(current.activeIds)
      if (body.enabled) {
        set.add(body.eventId)
      } else {
        set.delete(body.eventId)
      }
      nextActiveIds = Array.from(set)
    } else {
      return apiFail(
        "Expected either activeIds array or { eventId, enabled }",
        400,
        "VALIDATION"
      )
    }

    const groups = await loadConflictGroups()
    const conflicts = conflictsInActiveSet(nextActiveIds, groups)
    if (conflicts.length > 0) {
      const summary = conflicts
        .map((c) => `${c.reason} (${c.eventIds.join(" vs ")})`)
        .join("; ")
      return NextResponse.json(
        {
          success: false,
          message: `Event conflict: ${summary}`,
          error: "CONFLICT",
          statusCode: 400,
          data: { conflicts },
        },
        { status: 400 }
      )
    }

    const result = await updateActiveEvents(nextActiveIds)
    return apiOk(result)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to update active events",
      500,
      "EVENTS"
    )
  }
}
