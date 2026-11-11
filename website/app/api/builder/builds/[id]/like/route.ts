import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { toggleGearBuildLike } from "@/lib/gear-builds-store"
import { requireWebSession } from "@/lib/web-session"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("builder-builds-like", 60, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  const { id } = await ctx.params

  try {
    const result = toggleGearBuildLike(id, session.username)
    if (!result) return apiFail("Not found", 404, "NOT_FOUND")
    return apiOk(result)
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to toggle like",
      500,
      "GEAR_BUILDS"
    )
  }
}
