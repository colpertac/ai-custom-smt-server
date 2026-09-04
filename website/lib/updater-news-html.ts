import { remark } from "remark"
import remarkGfm from "remark-gfm"
import html from "remark-html"

import type { NewsImage, NewsPost } from "@/lib/news-store"
import { getPublicAppUrl } from "@/lib/env"
import { getWebsiteBranding } from "@/lib/site-settings-store"
import { splitSiteName } from "@/lib/website-branding"

/**
 * Styles for Qt5 WebEngine (Chromium ~69). Prefer flex/box model over gap;
 * no external fonts or JS frameworks.
 */
const UPDATER_STYLES = `
* { box-sizing: border-box; }
html {
  background: #0e0e0e;
}
body {
  font-family: "Segoe UI", Tahoma, Arial, sans-serif;
  font-size: 11pt;
  line-height: 1.5;
  margin: 0;
  padding: 0;
  color: #ced3e0;
  background: #0e0e0e;
}
a {
  color: #d3b800;
  text-decoration: none;
}
a:hover { color: #f0d24a; text-decoration: underline; }
a:visited { color: #cc9d00; }
h1, h2, h3 {
  font-family: Georgia, "Times New Roman", serif;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #e8ecf4;
  margin: 0 0 8px;
}
h1 { font-size: 18pt; letter-spacing: 0.08em; }
h2 { font-size: 13pt; margin: 16px 0 6px; }
h3 { font-size: 12pt; margin: 14px 0 4px; color: #d3b800; }
p { margin: 0 0 10px; }
ul, ol { margin: 0 0 10px 20px; padding: 0; }
li { margin: 0 0 4px; }
table {
  border-collapse: collapse;
  margin: 0 0 12px;
  width: 100%;
  background: #141414;
}
th, td {
  border: 1px solid #2a2a2a;
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}
th {
  background: #1a1a1a;
  color: #d3b800;
  font-size: 9pt;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
code {
  font-family: Consolas, "Courier New", monospace;
  font-size: 9pt;
  background: #1a1a1a;
  color: #f0d24a;
  padding: 1px 4px;
  border: 1px solid #2a2a2a;
}
pre {
  font-family: Consolas, "Courier New", monospace;
  font-size: 9pt;
  background: #141414;
  border: 1px solid #2a2a2a;
  padding: 10px;
  overflow: auto;
  color: #ced3e0;
}
hr {
  border: none;
  border-top: 1px solid #2a2a2a;
  margin: 14px 0;
}
.wrap {
  max-width: 640px;
  margin: 0 auto;
  padding: 16px 18px 28px;
}
.topbar {
  background: linear-gradient(180deg, #1a1a1a 0%, #141414 100%);
  border-bottom: 1px solid #2a2a2a;
  padding: 12px 18px;
}
.brand {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 11pt;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #e8ecf4;
  margin: 0;
}
.brand span {
  color: #d3b800;
}
.brand-sub {
  margin: 4px 0 0;
  font-size: 8pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8b93a7;
}
.gold-rule {
  height: 2px;
  width: 72px;
  margin: 10px 0 16px;
  background: linear-gradient(90deg, #d3b800, transparent);
  border: none;
}
.page-title {
  margin: 0 0 4px;
}
.lede {
  color: #8b93a7;
  font-size: 10pt;
  margin: 0 0 18px;
}
.meta {
  color: #8b93a7;
  font-size: 9pt;
  letter-spacing: 0.04em;
  margin: 0 0 6px;
}
.post {
  background: #141414;
  border: 1px solid #2a2a2a;
  padding: 12px 14px;
  margin: 0 0 10px;
}
.post h2 {
  margin: 0 0 4px;
  font-size: 13pt;
}
.post h2 a {
  color: #e8ecf4;
  text-decoration: none;
}
.post h2 a:hover {
  color: #f0d24a;
  text-decoration: none;
}
.post h2 a:visited {
  color: #ced3e0;
}
.summary {
  color: #8b93a7;
  font-size: 10pt;
  margin: 6px 0 0;
}
.nav {
  margin: 0 0 14px;
  font-size: 9pt;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.nav a {
  color: #cc9d00;
}
.content {
  color: #ced3e0;
}
.content a { color: #d3b800; }
.empty {
  color: #8b93a7;
  padding: 16px 14px;
  border: 1px dashed #2a2a2a;
  background: #141414;
}
.gallery {
  margin: 14px 0 18px;
}
.gallery img {
  display: block;
  width: 320px;
  max-width: 100%;
  height: auto;
  margin: 0 0 10px;
  border: 1px solid #2a2a2a;
  background: #141414;
}
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

function brandLabel(): { lead: string; accent: string } {
  return splitSiteName(getWebsiteBranding().siteName)
}

function pageShell(title: string, body: string): string {
  const brand = brandLabel()
  const brandHtml =
    brand.lead.length > 0
      ? `${escapeHtml(brand.lead)} <span>${escapeHtml(brand.accent)}</span>`
      : `<span>${escapeHtml(brand.accent)}</span>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style type="text/css">${UPDATER_STYLES}</style>
</head>
<body>
  <div class="topbar">
    <p class="brand">${brandHtml}</p>
    <p class="brand-sub">Server news</p>
  </div>
  <div class="wrap">
${body}
  </div>
</body>
</html>
`
}

export function renderUpdaterNewsListPage(posts: NewsPost[]): string {
  const base = getPublicAppUrl().replace(/\/$/, "")
  const items =
    posts.length === 0
      ? `<p class="empty">No news yet.</p>`
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

  const body = `<h1 class="page-title">Server news</h1>
<div class="gold-rule"></div>
<p class="lede">Realm notices for this private server.</p>
${items}`
  return pageShell("Server news", body)
}

function renderGalleryHtml(base: string, images: NewsImage[]): string {
  if (images.length === 0) return ""
  const imgs = images
    .map((image) => {
      const src = `${base}${image.url}`
      return `<img src="${escapeHtml(src)}" alt="" width="320" />`
    })
    .join("\n  ")
  return `<div class="gallery">
  ${imgs}
</div>`
}

export function renderUpdaterNewsPostPage(
  post: NewsPost,
  images: NewsImage[] = []
): string {
  const base = getPublicAppUrl().replace(/\/$/, "")
  const bodyHtml = markdownToUpdaterHtml(post.body)
  const galleryHtml = renderGalleryHtml(base, images)
  const body = `<p class="nav"><a href="${base}/updater/news">← All news</a></p>
<p class="meta">${escapeHtml(post.date)}</p>
<h1 class="page-title">${escapeHtml(post.title)}</h1>
<div class="gold-rule"></div>
${galleryHtml}
<div class="content">
${bodyHtml}
</div>`
  return pageShell(post.title, body)
}
