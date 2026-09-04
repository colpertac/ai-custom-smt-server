import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  NewsImageValidationError,
  getNewsPostById,
  reorderNewsImages,
} from "@/lib/news-store"
import { requireWebSession } from "@/lib/web-session"

type Ctx = { params: Promise<{ id: string }> }

const reorderSchema = z.object({
  imageIds: z.array(z.number().int().positive()).max(20),
})

function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

async function requireAdmin() {
  const session = await requireWebSession()
  if (!session) return { error: apiFail("Unauthorized", 401, "UNAUTHORIZED") }
  if (!isAdminLevel(session.userLevel)) {
    return { error: apiFail("Forbidden", 403, "FORBIDDEN") }
  }
  return { session }
}

export async function PUT(request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("admin-news-image-reorder", 60, 60_000)
  if (blocked) return blocked

  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const id = parseId((await ctx.params).id)
  if (id == null) return apiFail("Invalid id", 400, "VALIDATION")

  const post = getNewsPostById(id, { includeUnpublished: true })
  if (!post) return apiFail("Not found", 404, "NOT_FOUND")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = reorderSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  try {
    const images = reorderNewsImages(id, parsed.data.imageIds)
    return apiOk({ images }, "Reordered")
  } catch (error) {
    if (error instanceof NewsImageValidationError) {
      return apiFail(error.message, 400, "VALIDATION")
    }
    return apiFail(
      error instanceof Error ? error.message : "Reorder failed",
      500,
      "NEWS_IMAGE"
    )
  }
}
