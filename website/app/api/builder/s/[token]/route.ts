import { apiFail, apiOk } from "@/lib/api-response"
import { getGearBuildByShareToken } from "@/lib/gear-builds-store"

type Ctx = { params: Promise<{ token: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  const { token } = await ctx.params
  const build = getGearBuildByShareToken(token)
  if (!build) return apiFail("Not found", 404, "NOT_FOUND")
  return apiOk({
    name: build.name,
    payload: build.payload,
    updatedAt: build.updatedAt,
  })
}
