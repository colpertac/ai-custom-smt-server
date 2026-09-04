import fs from "node:fs"
import path from "node:path"

import { newsPosts as seedPosts } from "@/content/news"

import { DatabaseSync } from "./node-sqlite.ts"

export type NewsPost = {
  id: number
  title: string
  date: string
  summary: string
  /** Markdown source */
  body: string
  published: boolean
  createdAt: number
  updatedAt: number
}

export type NewsPostInput = {
  title: string
  date: string
  summary: string
  body: string
  published?: boolean
}

export type NewsImageExt = "png" | "jpg" | "webp" | "gif"

export type NewsImage = {
  id: number
  postId: number
  ext: NewsImageExt
  sortOrder: number
  createdAt: number
  url: string
}

export const NEWS_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const NEWS_IMAGE_MAX_PER_POST = 20

export class NewsImageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NewsImageValidationError"
  }
}

const NEWS_IMAGE_EXTS = new Set<NewsImageExt>(["png", "jpg", "webp", "gif"])

const NEWS_IMAGE_CONTENT_TYPES: Record<NewsImageExt, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
}

function websiteDataDir(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  const dir = custom || path.join(process.cwd(), "data")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function dbPath(): string {
  return path.join(websiteDataDir(), "web.sqlite")
}

function newsImagesRoot(): string {
  const dir = path.join(websiteDataDir(), "news")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function newsPostImagesDir(postId: number): string {
  const dir = path.join(newsImagesRoot(), String(postId))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function newsImageFilePath(
  postId: number,
  imageId: number,
  ext: NewsImageExt
): string {
  return path.join(newsPostImagesDir(postId), `${imageId}.${ext}`)
}

export function newsImagePublicUrl(
  postId: number,
  imageId: number,
  createdAt?: number
): string {
  const v = createdAt ?? Date.now()
  return `/api/news/${postId}/images/${imageId}?v=${v}`
}

export function newsImageContentType(ext: NewsImageExt): string {
  return NEWS_IMAGE_CONTENT_TYPES[ext]
}

let db: DatabaseSync | null = null
let seeded = false

function getDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(dbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS news_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      summary TEXT NOT NULL,
      body TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_news_date ON news_posts(date DESC);
    CREATE INDEX IF NOT EXISTS idx_news_published ON news_posts(published);

    CREATE TABLE IF NOT EXISTS news_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      ext TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (post_id) REFERENCES news_posts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_news_images_post ON news_images(post_id, sort_order);
  `)
  return db
}

type Row = {
  id: number
  title: string
  date: string
  summary: string
  body: string
  published: number
  created_at: number
  updated_at: number
}

type ImageRow = {
  id: number
  post_id: number
  ext: string
  sort_order: number
  created_at: number
}

function mapRow(row: Row): NewsPost {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    summary: row.summary,
    body: row.body,
    published: Boolean(row.published),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseImageExt(raw: string): NewsImageExt | null {
  const v = raw.trim().toLowerCase()
  if (!NEWS_IMAGE_EXTS.has(v as NewsImageExt)) return null
  return v as NewsImageExt
}

function mapImageRow(row: ImageRow): NewsImage {
  const ext = parseImageExt(row.ext)
  if (!ext) {
    throw new Error(`Invalid news image ext: ${row.ext}`)
  }
  return {
    id: row.id,
    postId: row.post_id,
    ext,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    url: newsImagePublicUrl(row.post_id, row.id, row.created_at),
  }
}

function detectNewsImageExt(buf: Buffer): NewsImageExt | null {
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "png"
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpg"
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp"
  }
  if (
    buf.length >= 6 &&
    buf.toString("ascii", 0, 3) === "GIF" &&
    (buf.toString("ascii", 3, 6) === "87a" ||
      buf.toString("ascii", 3, 6) === "89a")
  ) {
    return "gif"
  }
  return null
}

function removePostImageDir(postId: number): void {
  const dir = path.join(newsImagesRoot(), String(postId))
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

/** Seed from static content/news.ts once if the table is empty. */
export function ensureNewsSeeded(): void {
  if (seeded) return
  const database = getDb()
  const count = database
    .prepare(`SELECT COUNT(*) AS c FROM news_posts`)
    .get() as { c: number }
  if (count.c > 0) {
    seeded = true
    return
  }

  const now = Date.now()
  const insert = database.prepare(`
    INSERT INTO news_posts (title, date, summary, body, published, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `)
  // Insert oldest first so AUTOINCREMENT ids follow chronological order.
  const ordered = [...seedPosts].reverse()
  for (const post of ordered) {
    insert.run(
      post.title,
      post.date,
      post.summary,
      post.body.join("\n\n"),
      now,
      now
    )
  }
  seeded = true
}

export function listPublishedNews(): NewsPost[] {
  ensureNewsSeeded()
  const rows = getDb()
    .prepare(
      `SELECT * FROM news_posts WHERE published = 1 ORDER BY date DESC, id DESC`
    )
    .all() as Row[]
  return rows.map(mapRow)
}

export function listAllNews(): NewsPost[] {
  ensureNewsSeeded()
  const rows = getDb()
    .prepare(`SELECT * FROM news_posts ORDER BY date DESC, id DESC`)
    .all() as Row[]
  return rows.map(mapRow)
}

export function getNewsPostById(
  id: number,
  opts?: { includeUnpublished?: boolean }
): NewsPost | null {
  ensureNewsSeeded()
  const row = getDb()
    .prepare(`SELECT * FROM news_posts WHERE id = ?`)
    .get(id) as Row | undefined
  if (!row) return null
  const post = mapRow(row)
  if (!opts?.includeUnpublished && !post.published) return null
  return post
}

export function createNewsPost(input: NewsPostInput): NewsPost {
  ensureNewsSeeded()
  const now = Date.now()
  const published = input.published === false ? 0 : 1
  const result = getDb()
    .prepare(
      `INSERT INTO news_posts (title, date, summary, body, published, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.title.trim(),
      input.date.trim(),
      input.summary.trim(),
      input.body,
      published,
      now,
      now
    )
  const id = Number(result.lastInsertRowid)
  const post = getNewsPostById(id, { includeUnpublished: true })
  if (!post) throw new Error("Failed to read created news post")
  return post
}

export function updateNewsPost(
  id: number,
  input: NewsPostInput
): NewsPost | null {
  ensureNewsSeeded()
  const existing = getNewsPostById(id, { includeUnpublished: true })
  if (!existing) return null
  const now = Date.now()
  const published = input.published === false ? 0 : 1
  getDb()
    .prepare(
      `UPDATE news_posts
       SET title = ?, date = ?, summary = ?, body = ?, published = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      input.title.trim(),
      input.date.trim(),
      input.summary.trim(),
      input.body,
      published,
      now,
      id
    )
  return getNewsPostById(id, { includeUnpublished: true })
}

export function deleteNewsPost(id: number): boolean {
  ensureNewsSeeded()
  getDb().prepare(`DELETE FROM news_images WHERE post_id = ?`).run(id)
  const result = getDb().prepare(`DELETE FROM news_posts WHERE id = ?`).run(id)
  const deleted = Number(result.changes) > 0
  if (deleted) removePostImageDir(id)
  return deleted
}

export function listNewsImages(postId: number): NewsImage[] {
  ensureNewsSeeded()
  const rows = getDb()
    .prepare(
      `SELECT * FROM news_images WHERE post_id = ? ORDER BY sort_order ASC, id ASC`
    )
    .all(postId) as ImageRow[]
  return rows.map(mapImageRow)
}

export function getNewsImage(
  postId: number,
  imageId: number
): NewsImage | null {
  ensureNewsSeeded()
  const row = getDb()
    .prepare(`SELECT * FROM news_images WHERE id = ? AND post_id = ?`)
    .get(imageId, postId) as ImageRow | undefined
  if (!row) return null
  return mapImageRow(row)
}

export function addNewsImage(postId: number, bytes: Buffer): NewsImage {
  ensureNewsSeeded()
  const post = getNewsPostById(postId, { includeUnpublished: true })
  if (!post) {
    throw new NewsImageValidationError("Post not found")
  }
  if (!bytes.length) {
    throw new NewsImageValidationError("Empty file")
  }
  if (bytes.length > NEWS_IMAGE_MAX_BYTES) {
    throw new NewsImageValidationError("File too large (max 5 MiB)")
  }
  const ext = detectNewsImageExt(bytes)
  if (!ext) {
    throw new NewsImageValidationError("File must be PNG, JPEG, WebP, or GIF")
  }

  const existing = listNewsImages(postId)
  if (existing.length >= NEWS_IMAGE_MAX_PER_POST) {
    throw new NewsImageValidationError(
      `At most ${NEWS_IMAGE_MAX_PER_POST} images per post`
    )
  }

  const now = Date.now()
  const nextOrder =
    existing.length === 0
      ? 0
      : Math.max(...existing.map((img) => img.sortOrder)) + 1

  const result = getDb()
    .prepare(
      `INSERT INTO news_images (post_id, ext, sort_order, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(postId, ext, nextOrder, now)
  const imageId = Number(result.lastInsertRowid)

  const dest = newsImageFilePath(postId, imageId, ext)
  const tmp = `${dest}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, bytes)
    fs.renameSync(tmp, dest)
  } catch (error) {
    getDb().prepare(`DELETE FROM news_images WHERE id = ?`).run(imageId)
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* ignore */
    }
    throw error
  }

  const image = getNewsImage(postId, imageId)
  if (!image) throw new Error("Failed to read created news image")
  return image
}

export function deleteNewsImage(postId: number, imageId: number): boolean {
  ensureNewsSeeded()
  const image = getNewsImage(postId, imageId)
  if (!image) return false

  getDb()
    .prepare(`DELETE FROM news_images WHERE id = ? AND post_id = ?`)
    .run(imageId, postId)

  try {
    fs.unlinkSync(newsImageFilePath(postId, imageId, image.ext))
  } catch {
    /* ignore missing */
  }
  return true
}

export function reorderNewsImages(
  postId: number,
  imageIds: number[]
): NewsImage[] {
  ensureNewsSeeded()
  const post = getNewsPostById(postId, { includeUnpublished: true })
  if (!post) {
    throw new NewsImageValidationError("Post not found")
  }

  const existing = listNewsImages(postId)
  const existingIds = new Set(existing.map((img) => img.id))
  if (imageIds.length !== existing.length) {
    throw new NewsImageValidationError("imageIds must include every image once")
  }
  const seen = new Set<number>()
  for (const id of imageIds) {
    if (!existingIds.has(id) || seen.has(id)) {
      throw new NewsImageValidationError("imageIds must include every image once")
    }
    seen.add(id)
  }

  const database = getDb()
  const update = database.prepare(
    `UPDATE news_images SET sort_order = ? WHERE id = ? AND post_id = ?`
  )
  for (let i = 0; i < imageIds.length; i++) {
    update.run(i, imageIds[i], postId)
  }
  return listNewsImages(postId)
}

export function readNewsImageFile(
  postId: number,
  imageId: number
): { bytes: Buffer; contentType: string; createdAt: number } | null {
  const image = getNewsImage(postId, imageId)
  if (!image) return null
  const file = newsImageFilePath(postId, imageId, image.ext)
  if (!fs.existsSync(file)) return null
  return {
    bytes: fs.readFileSync(file),
    contentType: newsImageContentType(image.ext),
    createdAt: image.createdAt,
  }
}
