import { NextResponse } from "next/server"

import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { requireWebSession } from "@/lib/web-session"
import {
  getEventScheduleStatus,
  saveEventSchedule,
} from "@/lib/events/event-schedule-fs"
import type { EventScheduleConfig } from "@/lib/events/types"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const data = await getEventScheduleStatus()
    return apiOk(data)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to load event schedule",
      500,
      "EVENT_SCHEDULE"
    )
  }
}

export async function PUT(request: Request) {
  const blocked = await guardApiMutation("admin-events-schedule-update", 30, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: EventScheduleConfig
  try {
    body = (await request.json()) as EventScheduleConfig
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  try {
    const { config, validation } = await saveEventSchedule(body)
    if (!validation.ok) {
      return NextResponse.json(
        {
          success: false,
          message: "Schedule validation failed",
          error: "VALIDATION",
          statusCode: 400,
          data: {
            errors: validation.errors,
            conflicts: validation.conflicts,
            config,
          },
        },
        { status: 400 }
      )
    }

    // Persist only — do not apply/restart. Overview channel restart (or
    // daily flip) syncs desired → live when ready.
    const status = await getEventScheduleStatus()
    return apiOk({ ...status, config })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to save event schedule",
      500,
      "EVENT_SCHEDULE"
    )
  }
}
