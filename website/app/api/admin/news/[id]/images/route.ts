import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  NEWS_IMAGE_MAX_BYTES,
  NewsImageValidationError,
  addNewsImage,
  getNewsPostById,
  listNewsImages,
} from "@/lib/news-store"
import { requireWebSession } from "@/lib/web-session"

type Ctx = { params: Promise<{ id: string }> }

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

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const id = parseId((await ctx.params).id)
  if (id == null) return apiFail("Invalid id", 400, "VALIDATION")

  const post = getNewsPostById(id, { includeUnpublished: true })
  if (!post) return apiFail("Not found", 404, "NOT_FOUND")

  return apiOk({ images: listNewsImages(id) })
}

export async function POST(request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("admin-news-image-upload", 40, 60_000)
  if (blocked) return blocked

  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const id = parseId((await ctx.params).id)
  if (id == null) return apiFail("Invalid id", 400, "VALIDATION")

  const post = getNewsPostById(id, { includeUnpublished: true })
  if (!post) return apiFail("Not found", 404, "NOT_FOUND")

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiFail("Expected multipart form data", 400, "VALIDATION")
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return apiFail("Missing file", 400, "VALIDATION")
  }
  if (file.size <= 0) {
    return apiFail("Empty file", 400, "VALIDATION")
  }
  if (file.size > NEWS_IMAGE_MAX_BYTES) {
    return apiFail("File too large (max 5 MiB)", 413, "PAYLOAD")
  }

  let bytes: Buffer
  try {
    bytes = Buffer.from(await file.arrayBuffer())
  } catch {
    return apiFail("Failed to read upload", 400, "VALIDATION")
  }

  try {
    const image = addNewsImage(id, bytes)
    return apiOk({ image, images: listNewsImages(id) }, "Image uploaded")
  } catch (error) {
    if (error instanceof NewsImageValidationError) {
      return apiFail(error.message, 400, "VALIDATION")
    }
    return apiFail(
      error instanceof Error ? error.message : "Upload failed",
      500,
      "NEWS_IMAGE"
    )
  }
}
