import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import { guardApiMutation } from "@/lib/api-guard"
import { requireWebSession } from "@/lib/web-session"
import {
  deleteLoopProfile,
  listLoopProfiles,
  saveLoopProfile,
} from "@/lib/events/event-schedule-profiles-fs"
import type { EventScheduleLoopDay } from "@/lib/events/types"

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  try {
    const profiles = await listLoopProfiles()
    return apiOk({ profiles })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to list loop profiles",
      500,
      "EVENT_SCHEDULE_PROFILES"
    )
  }
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation(
    "admin-events-schedule-profiles-save",
    30,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  let body: {
    id?: string
    name?: string
    description?: string
    alwaysOnIds?: string[]
    days?: EventScheduleLoopDay[]
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return apiFail("Invalid JSON", 400, "VALIDATION")
  }

  try {
    const profile = await saveLoopProfile({
      id: body.id,
      name: body.name ?? "",
      description: body.description,
      alwaysOnIds: body.alwaysOnIds ?? [],
      days: body.days ?? [],
    })
    const profiles = await listLoopProfiles()
    return apiOk({ profile, profiles })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to save loop profile",
      400,
      "VALIDATION"
    )
  }
}

export async function DELETE(request: Request) {
  const blocked = await guardApiMutation(
    "admin-events-schedule-profiles-delete",
    30,
    60_000
  )
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const url = new URL(request.url)
  const id = url.searchParams.get("id")?.trim()
  if (!id) return apiFail("Missing profile id", 400, "VALIDATION")

  try {
    await deleteLoopProfile(id)
    const profiles = await listLoopProfiles()
    return apiOk({ profiles })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to delete loop profile",
      400,
      "VALIDATION"
    )
  }
}
