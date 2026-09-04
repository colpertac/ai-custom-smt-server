import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  deleteNewsImage,
  getNewsPostById,
  listNewsImages,
} from "@/lib/news-store"
import { requireWebSession } from "@/lib/web-session"

type Ctx = { params: Promise<{ id: string; imageId: string }> }

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

export async function DELETE(_request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("admin-news-image-delete", 40, 60_000)
  if (blocked) return blocked

  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const { id: rawId, imageId: rawImageId } = await ctx.params
  const id = parseId(rawId)
  const imageId = parseId(rawImageId)
  if (id == null || imageId == null) {
    return apiFail("Invalid id", 400, "VALIDATION")
  }

  const post = getNewsPostById(id, { includeUnpublished: true })
  if (!post) return apiFail("Not found", 404, "NOT_FOUND")

  if (!deleteNewsImage(id, imageId)) {
    return apiFail("Image not found", 404, "NOT_FOUND")
  }

  return apiOk({ images: listNewsImages(id) }, "Deleted")
}
