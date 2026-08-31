import { listPublishedNews } from "@/lib/news-store"
import { renderUpdaterNewsListPage } from "@/lib/updater-news-html"

export const dynamic = "force-dynamic"

export async function GET() {
  const posts = listPublishedNews()
  const html = renderUpdaterNewsListPage(posts)
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-cache, no-store, must-revalidate",
    },
  })
}
