import { remark } from "remark"
import remarkGfm from "remark-gfm"
import html from "remark-html"

import type { NewsPost } from "@/lib/news-store"
import { getPublicAppUrl } from "@/lib/env"

const UPDATER_STYLES = `
body {
  font-family: Tahoma, Arial, sans-serif;
  font-size: 10pt;
  line-height: 1.45;
  margin: 12px 16px;
  color: #111;
  background: #fff;
}
a { color: #0645ad; }
a:visited { color: #0b0080; }
h1 { font-size: 14pt; margin: 0 0 8px; }
h2 { font-size: 12pt; margin: 14px 0 6px; }
h3 { font-size: 11pt; margin: 12px 0 4px; }
p { margin: 0 0 10px; }
ul, ol { margin: 0 0 10px 20px; padding: 0; }
li { margin: 0 0 4px; }
table { border-collapse: collapse; margin: 0 0 12px; width: 100%; }
th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #eee; }
code { font-family: Consolas, monospace; font-size: 9pt; background: #f4f4f4; padding: 0 2px; }
pre { font-family: Consolas, monospace; font-size: 9pt; background: #f4f4f4; padding: 8px; overflow: auto; }
hr { border: none; border-top: 1px solid #ccc; margin: 12px 0; }
.meta { color: #555; font-size: 9pt; margin-bottom: 12px; }
.post { border-top: 1px solid #ccc; padding-top: 10px; margin-top: 10px; }
.post:first-child { border-top: none; padding-top: 0; margin-top: 0; }
.summary { color: #333; margin: 4px 0 0; }
.nav { margin-bottom: 12px; font-size: 9pt; }
`.trim()

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function markdownToUpdaterHtml(source: string): string {
  const file = remark().use(remarkGfm).use(html, { sanitize: false }).processSync(source)
  return String(file)
}

function pageShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style type="text/css">${UPDATER_STYLES}</style>
</head>
<body>
${body}
</body>
</html>
`
}

export function renderUpdaterNewsListPage(posts: NewsPost[]): string {
  const base = getPublicAppUrl().replace(/\/$/, "")
  const items =
    posts.length === 0
      ? "<p>No news yet.</p>"
      : posts
          .map((post) => {
            const href = `${base}/updater/news/${post.id}`
            return `<div class="post">
  <p class="meta">${escapeHtml(post.date)}</p>
  <h2><a href="${href}">${escapeHtml(post.title)}</a></h2>
  <p class="summary">${escapeHtml(post.summary)}</p>
</div>`
          })
          .join("\n")

  const body = `<h1>Server news</h1>
<p class="meta">Realm notices — lightweight view for the game updater.</p>
${items}`
  return pageShell("Server news", body)
}

export function renderUpdaterNewsPostPage(post: NewsPost): string {
  const base = getPublicAppUrl().replace(/\/$/, "")
  const bodyHtml = markdownToUpdaterHtml(post.body)
  const body = `<p class="nav"><a href="${base}/updater/news">← All news</a></p>
<p class="meta">${escapeHtml(post.date)}</p>
<h1>${escapeHtml(post.title)}</h1>
${bodyHtml}`
  return pageShell(post.title, body)
}
