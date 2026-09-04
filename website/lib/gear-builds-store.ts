import { randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { DatabaseSync } from "./node-sqlite.ts"
import type { PlannerStoredState } from "@/lib/gear-planner-combat"

export type GearBuildRow = {
  id: string
  username: string
  name: string
  payload: PlannerStoredState
  shareToken: string | null
  updatedAt: number
  createdAt: number
}

function dbPath(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  const dir = custom || path.join(process.cwd(), "data")
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, "web.sqlite")
}

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(dbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS gear_builds (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      name TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      share_token TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gear_builds_user ON gear_builds(username);
    CREATE INDEX IF NOT EXISTS idx_gear_builds_share ON gear_builds(share_token);
  `)
  return db
}

function newId(): string {
  return randomBytes(12).toString("hex")
}

function newShareToken(): string {
  return randomBytes(16).toString("hex")
}

function rowToBuild(row: {
  id: string
  username: string
  name: string
  payload_json: string
  share_token: string | null
  created_at: number
  updated_at: number
}): GearBuildRow {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    payload: JSON.parse(row.payload_json) as PlannerStoredState,
    shareToken: row.share_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listGearBuilds(username: string): GearBuildRow[] {
  const normalized = username.toLowerCase()
  const rows = getDb()
    .prepare(
      `SELECT id, username, name, payload_json, share_token, created_at, updated_at
       FROM gear_builds WHERE username = ? ORDER BY updated_at DESC`
    )
    .all(normalized) as Array<{
    id: string
    username: string
    name: string
    payload_json: string
    share_token: string | null
    created_at: number
    updated_at: number
  }>
  return rows.map(rowToBuild)
}

export function getGearBuild(
  id: string,
  username?: string
): GearBuildRow | null {
  const row = getDb()
    .prepare(
      `SELECT id, username, name, payload_json, share_token, created_at, updated_at
       FROM gear_builds WHERE id = ?`
    )
    .get(id) as
    | {
        id: string
        username: string
        name: string
        payload_json: string
        share_token: string | null
        created_at: number
        updated_at: number
      }
    | undefined
  if (!row) return null
  if (username && row.username !== username.toLowerCase()) return null
  return rowToBuild(row)
}

export function getGearBuildByShareToken(
  token: string
): GearBuildRow | null {
  if (!token || token.length < 16) return null
  const row = getDb()
    .prepare(
      `SELECT id, username, name, payload_json, share_token, created_at, updated_at
       FROM gear_builds WHERE share_token = ?`
    )
    .get(token) as
    | {
        id: string
        username: string
        name: string
        payload_json: string
        share_token: string | null
        created_at: number
        updated_at: number
      }
    | undefined
  return row ? rowToBuild(row) : null
}

export function createGearBuild(options: {
  username: string
  name: string
  payload: PlannerStoredState
}): GearBuildRow {
  const id = newId()
  const now = Date.now()
  const username = options.username.toLowerCase()
  const name = options.name.trim() || "Untitled build"
  getDb()
    .prepare(
      `INSERT INTO gear_builds (id, username, name, payload_json, share_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`
    )
    .run(id, username, name, JSON.stringify(options.payload), now, now)
  return getGearBuild(id)!
}

export function updateGearBuild(options: {
  id: string
  username: string
  name?: string
  payload?: PlannerStoredState
}): GearBuildRow | null {
  const existing = getGearBuild(options.id, options.username)
  if (!existing) return null
  const name =
    options.name != null
      ? options.name.trim() || existing.name
      : existing.name
  const payload = options.payload ?? existing.payload
  const now = Date.now()
  getDb()
    .prepare(
      `UPDATE gear_builds SET name = ?, payload_json = ?, updated_at = ? WHERE id = ? AND username = ?`
    )
    .run(
      name,
      JSON.stringify(payload),
      now,
      options.id,
      options.username.toLowerCase()
    )
  return getGearBuild(options.id)!
}

export function deleteGearBuild(id: string, username: string): boolean {
  const result = getDb()
    .prepare(`DELETE FROM gear_builds WHERE id = ? AND username = ?`)
    .run(id, username.toLowerCase())
  return Number(result.changes ?? 0) > 0
}

export function ensureGearBuildShareToken(
  id: string,
  username: string
): { build: GearBuildRow; token: string } | null {
  const existing = getGearBuild(id, username)
  if (!existing) return null
  if (existing.shareToken) {
    return { build: existing, token: existing.shareToken }
  }
  const token = newShareToken()
  const now = Date.now()
  getDb()
    .prepare(
      `UPDATE gear_builds SET share_token = ?, updated_at = ? WHERE id = ? AND username = ?`
    )
    .run(token, now, id, username.toLowerCase())
  const build = getGearBuild(id)!
  return { build, token }
}

/** Test helper */
export function resetGearBuildsStoreForTests(): void {
  if (db) {
    db.close()
    db = null
  }
}
