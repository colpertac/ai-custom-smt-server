import { z } from "zod"

import { apiFail, apiOk } from "@/lib/api-response"
import { guardApiMutation } from "@/lib/api-guard"
import { cloneGearBuildFromShareToken } from "@/lib/gear-builds-store"
import { requireWebSession } from "@/lib/web-session"

const bodySchema = z.object({
  token: z.string().trim().min(16).max(128),
})

export async function POST(request: Request) {
  const blocked = await guardApiMutation("builder-builds-clone", 40, 60_000)
  if (blocked) return blocked

  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")

  try {
    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return apiFail("Invalid body", 400, "VALIDATION")
    }
    const build = cloneGearBuildFromShareToken({
      token: parsed.data.token,
      username: session.username,
    })
    if (!build) return apiFail("Not found", 404, "NOT_FOUND")
    return apiOk({
      id: build.id,
      name: build.name,
      shareToken: build.shareToken,
      isPublished: build.isPublished,
      publishedAt: build.publishedAt,
      updatedAt: build.updatedAt,
      createdAt: build.createdAt,
    })
  } catch (error) {
    return apiFail(
      error instanceof Error ? error.message : "Failed to clone build",
      500,
      "GEAR_BUILDS"
    )
  }
}
