import { NextResponse } from "next/server"

import { isAdminLevel } from "@/lib/admin-level"
import { apiFail } from "@/lib/api-response"
import { getFeedbackById, readFeedbackImageFile } from "@/lib/feedback-store"
import { requireWebSession } from "@/lib/web-session"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

export async function GET(_request: Request, ctx: Ctx) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const id = parseId((await ctx.params).id)
  if (id == null) return apiFail("Not found", 404, "NOT_FOUND")

  const item = getFeedbackById(id)
  if (!item) return apiFail("Not found", 404, "NOT_FOUND")

  const imageIdRaw = new URL(_request.url).searchParams.get("imageId")
  const imageId = imageIdRaw ? parseId(imageIdRaw) : null
  if (imageIdRaw && imageId == null) {
    return apiFail("Not found", 404, "NOT_FOUND")
  }

  const file = readFeedbackImageFile(id, imageId ?? undefined)
  if (!file) return apiFail("Not found", 404, "NOT_FOUND")

  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
      ETag: `"${file.createdAt}"`,
    },
  })
}
