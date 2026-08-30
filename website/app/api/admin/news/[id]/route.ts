import { z } from "zod"

import { guardApiMutation } from "@/lib/api-guard"
import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  deleteNewsPost,
  getNewsPostById,
  updateNewsPost,
} from "@/lib/news-store"
import { requireWebSession } from "@/lib/web-session"

const updateSchema = z.object({
  title: z.string().trim().min(1, "Title required").max(200),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  summary: z.string().trim().min(1, "Summary required").max(500),
  body: z.string().min(1, "Body required").max(100_000),
  published: z.boolean().optional(),
})

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
  return apiOk({ post })
}

export async function PUT(request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("admin-news-update", 60, 60_000)
  if (blocked) return blocked

  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const id = parseId((await ctx.params).id)
  if (id == null) return apiFail("Invalid id", 400, "VALIDATION")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiFail("Invalid JSON", 400, "BAD_REQUEST")
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return apiFail(
      parsed.error.issues[0]?.message ?? "Invalid input",
      400,
      "VALIDATION"
    )
  }

  const post = updateNewsPost(id, parsed.data)
  if (!post) return apiFail("Not found", 404, "NOT_FOUND")
  return apiOk({ post }, "Updated")
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const blocked = await guardApiMutation("admin-news-delete", 20, 60_000)
  if (blocked) return blocked

  const auth = await requireAdmin()
  if ("error" in auth) return auth.error

  const id = parseId((await ctx.params).id)
  if (id == null) return apiFail("Invalid id", 400, "VALIDATION")

  if (!deleteNewsPost(id)) return apiFail("Not found", 404, "NOT_FOUND")
  return apiOk({ id }, "Deleted")
}
