import fs from "node:fs"
import path from "node:path"

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_IMAGE_MAX_COUNT,
  FEEDBACK_STATUSES,
  type FeedbackCategory,
  type FeedbackItem,
  type FeedbackStatus,
} from "./feedback-constants.ts"
import { DatabaseSync } from "./node-sqlite.ts"

export {
  FEEDBACK_BODY_MAX,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_IMAGE_MAX_BYTES,
  FEEDBACK_IMAGE_MAX_COUNT,
  FEEDBACK_STATUSES,
  type FeedbackCategory,
  type FeedbackImage,
  type FeedbackItem,
  type FeedbackStatus,
} from "./feedback-constants.ts"

export type FeedbackImageExt = "png" | "jpg" | "webp" | "gif"

export class FeedbackImageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FeedbackImageValidationError"
  }
}

const FEEDBACK_IMAGE_EXTS = new Set<FeedbackImageExt>([
  "png",
  "jpg",
  "webp",
  "gif",
])

const FEEDBACK_IMAGE_CONTENT_TYPES: Record<FeedbackImageExt, string> = {
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

function feedbackImagesRoot(): string {
  const dir = path.join(websiteDataDir(), "feedback")
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function feedbackImagesDir(feedbackId: number): string {
  const dir = path.join(feedbackImagesRoot(), String(feedbackId))
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function feedbackImageFilePath(
  feedbackId: number,
  imageId: number,
  ext: FeedbackImageExt
): string {
  return path.join(feedbackImagesDir(feedbackId), `${imageId}.${ext}`)
}

export function feedbackImageAdminUrl(
  feedbackId: number,
  imageId: number,
  createdAt?: number
): string {
  const v = createdAt ?? Date.now()
  return `/api/admin/feedback/${feedbackId}/image?imageId=${imageId}&v=${v}`
}

export function feedbackImageContentType(ext: FeedbackImageExt): string {
  return FEEDBACK_IMAGE_CONTENT_TYPES[ext]
}

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(dbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      category TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_status_created
      ON feedback(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS feedback_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_id INTEGER NOT NULL,
      ext TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_images_feedback
      ON feedback_images(feedback_id);
  `)
  return db
}

type FeedbackRow = {
  id: number
  username: string | null
  category: string
  body: string
  status: string
  created_at: number
}

type ImageRow = {
  id: number
  feedback_id: number
  ext: string
  created_at: number
}

function parseCategory(raw: string): FeedbackCategory | null {
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as FeedbackCategory)
    : null
}

function parseStatus(raw: string): FeedbackStatus | null {
  return (FEEDBACK_STATUSES as readonly string[]).includes(raw)
    ? (raw as FeedbackStatus)
    : null
}

function parseImageExt(raw: string): FeedbackImageExt | null {
  const v = raw.trim().toLowerCase()
  if (!FEEDBACK_IMAGE_EXTS.has(v as FeedbackImageExt)) return null
  return v as FeedbackImageExt
}

function detectFeedbackImageExt(buf: Buffer): FeedbackImageExt | null {
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

function getImageRow(feedbackId: number): ImageRow | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM feedback_images WHERE feedback_id = ? ORDER BY id ASC LIMIT 1`
    )
    .get(feedbackId) as ImageRow | undefined
  return row ?? null
}

function getImageRowById(
  feedbackId: number,
  imageId: number
): ImageRow | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM feedback_images WHERE feedback_id = ? AND id = ?`
    )
    .get(feedbackId, imageId) as ImageRow | undefined
  return row ?? null
}

function getImageRows(feedbackId: number): ImageRow[] {
  return getDb()
    .prepare(
      `SELECT * FROM feedback_images WHERE feedback_id = ? ORDER BY id ASC`
    )
    .all(feedbackId) as ImageRow[]
}

function listImageRows(feedbackIds: number[]): ImageRow[] {
  if (feedbackIds.length === 0) return []
  const placeholders = feedbackIds.map(() => "?").join(",")
  return getDb()
    .prepare(
      `SELECT * FROM feedback_images WHERE feedback_id IN (${placeholders}) ORDER BY id ASC`
    )
    .all(...feedbackIds) as ImageRow[]
}

function countImages(feedbackId: number): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM feedback_images WHERE feedback_id = ?`
    )
    .get(feedbackId) as { n: number }
  return Number(row.n)
}

function mapRow(row: FeedbackRow, images: ImageRow[]): FeedbackItem {
  const category = parseCategory(row.category)
  const status = parseStatus(row.status)
  if (!category || !status) {
    throw new Error(`Invalid feedback row ${row.id}`)
  }
  return {
    id: row.id,
    username: row.username,
    category,
    body: row.body,
    status,
    createdAt: row.created_at,
    images: images.map((img) => ({
      id: img.id,
      url: feedbackImageAdminUrl(row.id, img.id, img.created_at),
    })),
  }
}

function removeFeedbackImageDir(feedbackId: number): void {
  const dir = path.join(feedbackImagesRoot(), String(feedbackId))
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

function deleteFeedbackRow(id: number): void {
  getDb().prepare(`DELETE FROM feedback_images WHERE feedback_id = ?`).run(id)
  getDb().prepare(`DELETE FROM feedback WHERE id = ?`).run(id)
  removeFeedbackImageDir(id)
}

function addFeedbackImage(feedbackId: number, bytes: Buffer): void {
  if (!bytes.length) {
    throw new FeedbackImageValidationError("Empty file")
  }
  if (bytes.length > FEEDBACK_IMAGE_MAX_BYTES) {
    throw new FeedbackImageValidationError("File too large (max 5 MiB)")
  }
  const ext = detectFeedbackImageExt(bytes)
  if (!ext) {
    throw new FeedbackImageValidationError(
      "File must be PNG, JPEG, WebP, or GIF"
    )
  }
  if (countImages(feedbackId) >= FEEDBACK_IMAGE_MAX_COUNT) {
    throw new FeedbackImageValidationError(
      `At most ${FEEDBACK_IMAGE_MAX_COUNT} screenshots per submission`
    )
  }

  const now = Date.now()
  const result = getDb()
    .prepare(
      `INSERT INTO feedback_images (feedback_id, ext, created_at)
       VALUES (?, ?, ?)`
    )
    .run(feedbackId, ext, now)
  const imageId = Number(result.lastInsertRowid)

  const dest = feedbackImageFilePath(feedbackId, imageId, ext)
  const tmp = `${dest}.${process.pid}.tmp`
  try {
    fs.writeFileSync(tmp, bytes)
    fs.renameSync(tmp, dest)
  } catch (error) {
    getDb().prepare(`DELETE FROM feedback_images WHERE id = ?`).run(imageId)
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* ignore */
    }
    throw error
  }
}

export function createFeedback(input: {
  username: string | null
  category: FeedbackCategory
  body: string
  imageBytes?: Buffer[]
}): FeedbackItem {
  const now = Date.now()
  const result = getDb()
    .prepare(
      `INSERT INTO feedback (username, category, body, status, created_at)
       VALUES (?, ?, ?, 'open', ?)`
    )
    .run(input.username, input.category, input.body, now)
  const id = Number(result.lastInsertRowid)

  if (input.imageBytes?.length) {
    try {
      for (const bytes of input.imageBytes) {
        addFeedbackImage(id, bytes)
      }
    } catch (error) {
      deleteFeedbackRow(id)
      throw error
    }
  }

  const item = getFeedbackById(id)
  if (!item) throw new Error("Failed to read created feedback")
  return item
}

export function getFeedbackById(id: number): FeedbackItem | null {
  const row = getDb()
    .prepare(`SELECT * FROM feedback WHERE id = ?`)
    .get(id) as FeedbackRow | undefined
  if (!row) return null
  return mapRow(row, getImageRows(row.id))
}

export function listFeedback(status: FeedbackStatus): FeedbackItem[] {
  const rows = getDb()
    .prepare(
      `SELECT id, username, category, body, status, created_at
       FROM feedback
       WHERE status = ?
       ORDER BY created_at DESC, id DESC`
    )
    .all(status) as FeedbackRow[]
  const images = listImageRows(rows.map((row) => row.id))
  const byFeedback = new Map<number, ImageRow[]>()
  for (const img of images) {
    const list = byFeedback.get(img.feedback_id) ?? []
    list.push(img)
    byFeedback.set(img.feedback_id, list)
  }
  return rows.map((row) => mapRow(row, byFeedback.get(row.id) ?? []))
}

export function setFeedbackStatus(
  id: number,
  status: FeedbackStatus
): FeedbackItem | null {
  const existing = getFeedbackById(id)
  if (!existing) return null
  getDb()
    .prepare(`UPDATE feedback SET status = ? WHERE id = ?`)
    .run(status, id)
  return getFeedbackById(id)
}

export function readFeedbackImageFile(
  feedbackId: number,
  imageId?: number
): { bytes: Buffer; contentType: string; createdAt: number } | null {
  const row =
    imageId != null
      ? getImageRowById(feedbackId, imageId)
      : getImageRow(feedbackId)
  if (!row) return null
  const ext = parseImageExt(row.ext)
  if (!ext) return null
  const file = feedbackImageFilePath(feedbackId, row.id, ext)
  if (!fs.existsSync(file)) return null
  return {
    bytes: fs.readFileSync(file),
    contentType: feedbackImageContentType(ext),
    createdAt: row.created_at,
  }
}
