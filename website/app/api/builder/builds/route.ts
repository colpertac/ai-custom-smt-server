import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import {
  createGearBuild,
  listGearBuilds,
} from "@/lib/gear-builds-store"
import type { PlannerStoredState } from "@/lib/gear-planner-combat"
import { requireWebSession } from "@/lib/web-session"

function isPayload(value: unknown): value is PlannerStoredState {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.slots) && typeof v.attrs === "object"
}

export async function GET() {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  try {
    const builds = listGearBuilds(session.username).map((b) => ({
      id: b.id,
      name: b.name,
      shareToken: b.shareToken,
      updatedAt: b.updatedAt,
      createdAt: b.createdAt,
    }))
    return apiOk({ builds })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to list builds",
      500,
      "GEAR_BUILDS"
    )
  }
}

export async function POST(request: Request) {
  const blocked = await guardApiMutation("builder-builds-create", 40, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")

  try {
    const body = (await request.json()) as {
      name?: string
      payload?: unknown
    }
    if (!isPayload(body.payload)) {
      return apiFail("Invalid build payload", 400, "VALIDATION")
    }
    const build = createGearBuild({
      username: session.username,
      name: body.name ?? "Untitled build",
      payload: body.payload,
    })
    return apiOk({
      id: build.id,
      name: build.name,
      shareToken: build.shareToken,
      updatedAt: build.updatedAt,
      createdAt: build.createdAt,
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to create build",
      500,
      "GEAR_BUILDS"
    )
  }
}
