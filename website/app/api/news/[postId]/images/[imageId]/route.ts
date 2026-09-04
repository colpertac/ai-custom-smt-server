import { NextResponse } from "next/server"

import { isAdminLevel } from "@/lib/admin-level"
import { getNewsPostById, readNewsImageFile } from "@/lib/news-store"
import { requireWebSession } from "@/lib/web-session"

export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ postId: string; imageId: string }> }

function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

export async function GET(_request: Request, ctx: Ctx) {
  const { postId: rawPostId, imageId: rawImageId } = await ctx.params
  const postId = parseId(rawPostId)
  const imageId = parseId(rawImageId)
  if (postId == null || imageId == null) {
    return new NextResponse(null, { status: 404 })
  }

  const post = getNewsPostById(postId, { includeUnpublished: true })
  if (!post) {
    return new NextResponse(null, { status: 404 })
  }

  if (!post.published) {
    const session = await requireWebSession()
    if (!session || !isAdminLevel(session.userLevel)) {
      return new NextResponse(null, { status: 404 })
    }
  }

  const file = readNewsImageFile(postId, imageId)
  if (!file) {
    return new NextResponse(null, { status: 404 })
  }

  return new NextResponse(new Uint8Array(file.bytes), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": post.published
        ? "public, max-age=3600, stale-while-revalidate=86400"
        : "private, no-cache, no-store, must-revalidate",
      ETag: `"${file.createdAt}"`,
    },
  })
}
