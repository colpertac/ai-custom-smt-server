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

function dbPath(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  const dir = custom || path.join(process.cwd(), "data")
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, "web.sqlite")
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
  const result = getDb().prepare(`DELETE FROM news_posts WHERE id = ?`).run(id)
  return Number(result.changes) > 0
}
