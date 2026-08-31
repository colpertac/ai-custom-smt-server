import { getNewsPostById } from "@/lib/news-store"
import { renderUpdaterNewsPostPage } from "@/lib/updater-news-html"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Props) {
  const { id: raw } = await params
  const id = Number.parseInt(raw, 10)
  if (!Number.isFinite(id) || id <= 0) {
    return new Response("Not found", { status: 404 })
  }
  const post = getNewsPostById(id)
  if (!post) {
    return new Response("Not found", { status: 404 })
  }
  const html = renderUpdaterNewsPostPage(post)
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  })
}
