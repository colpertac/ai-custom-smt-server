import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import {
  deleteGearBuild,
  getGearBuild,
  updateGearBuild,
} from "@/lib/gear-builds-store"
import type { PlannerStoredState } from "@/lib/gear-planner-combat"
import { requireWebSession } from "@/lib/web-session"

function isPayload(value: unknown): value is PlannerStoredState {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.slots) && typeof v.attrs === "object"
}

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  const { id } = await ctx.params
  const build = getGearBuild(id, session.username)
  if (!build) return apiFail("Not found", 404, "NOT_FOUND")
  return apiOk({
    id: build.id,
    name: build.name,
    payload: build.payload,
    shareToken: build.shareToken,
    updatedAt: build.updatedAt,
    createdAt: build.createdAt,
  })
}

export async function PATCH(request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("builder-builds-update", 60, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  const { id } = await ctx.params

  try {
    const body = (await request.json()) as {
      name?: string
      payload?: unknown
    }
    if (body.payload != null && !isPayload(body.payload)) {
      return apiFail("Invalid build payload", 400, "VALIDATION")
    }
    const build = updateGearBuild({
      id,
      username: session.username,
      name: body.name,
      payload: isPayload(body.payload) ? body.payload : undefined,
    })
    if (!build) return apiFail("Not found", 404, "NOT_FOUND")
    return apiOk({
      id: build.id,
      name: build.name,
      shareToken: build.shareToken,
      updatedAt: build.updatedAt,
      createdAt: build.createdAt,
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to update build",
      500,
      "GEAR_BUILDS"
    )
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("builder-builds-delete", 40, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  const { id } = await ctx.params
  const ok = deleteGearBuild(id, session.username)
  if (!ok) return apiFail("Not found", 404, "NOT_FOUND")
  return apiOk({ ok: true })
}
