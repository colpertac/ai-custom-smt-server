import { z } from "zod"

import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { setGearBuildPublished } from "@/lib/gear-builds-store"
import { requireWebSession } from "@/lib/web-session"

type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  published: z.boolean(),
})

export async function POST(request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("builder-builds-publish", 30, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  const { id } = await ctx.params

  try {
    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return apiFail("Invalid body", 400, "VALIDATION")
    }
    const build = setGearBuildPublished(
      id,
      session.username,
      parsed.data.published
    )
    if (!build) return apiFail("Not found", 404, "NOT_FOUND")
    return apiOk({
      id: build.id,
      name: build.name,
      shareToken: build.shareToken,
      isPublished: build.isPublished,
      publishedAt: build.publishedAt,
      path: build.shareToken ? `/builder/s/${build.shareToken}` : null,
      updatedAt: build.updatedAt,
      createdAt: build.createdAt,
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to update publish state",
      500,
      "GEAR_BUILDS"
    )
  }
}
