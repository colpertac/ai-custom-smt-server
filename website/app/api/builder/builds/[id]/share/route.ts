import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { ensureGearBuildShareToken } from "@/lib/gear-builds-store"
import { requireWebSession } from "@/lib/web-session"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("builder-builds-share", 30, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  const { id } = await ctx.params

  const result = ensureGearBuildShareToken(id, session.username)
  if (!result) return apiFail("Not found", 404, "NOT_FOUND")

  return apiOk({
    token: result.token,
    path: `/builder/s/${result.token}`,
  })
}
