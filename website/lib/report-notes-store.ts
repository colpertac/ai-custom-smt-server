import fs from "node:fs"
import path from "node:path"

import { DatabaseSync } from "./node-sqlite.ts"

export type ReportNote = {
  worldId: number
  uid: string
  note: string
  updatedBy: string
  updatedAt: number
}

function dbPath(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  const dir = custom || path.join(process.cwd(), "data")
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, "web.sqlite")
}

let db: DatabaseSync | null = null

type NoteRow = {
  world_id: number
  uid: string
  note: string
  updated_by: string
  updated_at: number
}

function getDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(dbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS report_notes (
      world_id INTEGER NOT NULL,
      uid TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (world_id, uid)
    );
  `)
  return db
}

function rowToNote(row: NoteRow): ReportNote {
  return {
    worldId: row.world_id,
    uid: row.uid,
    note: row.note,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }
}

export function getReportNotesMap(
  worldId: number,
  uids: string[]
): Map<string, ReportNote> {
  const out = new Map<string, ReportNote>()
  if (uids.length === 0) return out

  const database = getDb()
  const stmt = database.prepare(
    `SELECT world_id, uid, note, updated_by, updated_at
     FROM report_notes
     WHERE world_id = ? AND uid = ?`
  )
  for (const uid of uids) {
    const row = stmt.get(worldId, uid) as NoteRow | undefined
    if (row) out.set(uid, rowToNote(row))
  }
  return out
}

export function upsertReportNote(input: {
  worldId: number
  uid: string
  note: string
  updatedBy: string
}): ReportNote {
  const note = input.note.trim()
  const updatedAt = Date.now()
  const database = getDb()

  if (!note) {
    database
      .prepare(`DELETE FROM report_notes WHERE world_id = ? AND uid = ?`)
      .run(input.worldId, input.uid)
    return {
      worldId: input.worldId,
      uid: input.uid,
      note: "",
      updatedBy: input.updatedBy,
      updatedAt,
    }
  }

  database
    .prepare(
      `INSERT INTO report_notes (world_id, uid, note, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(world_id, uid) DO UPDATE SET
         note = excluded.note,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`
    )
    .run(input.worldId, input.uid, note, input.updatedBy, updatedAt)

  return {
    worldId: input.worldId,
    uid: input.uid,
    note,
    updatedBy: input.updatedBy,
    updatedAt,
  }
}
