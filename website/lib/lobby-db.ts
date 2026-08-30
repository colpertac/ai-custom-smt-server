import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { DatabaseSync } from "./node-sqlite.ts"

export function getLobbyDbPath(): string {
  const custom = process.env.COMP_LOBBY_DB?.trim()
  if (custom) return path.resolve(custom)
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../comp_hack/runtime/database/comp_hack.sqlite3"
  )
}

let cached: { path: string; db: DatabaseSync } | null = null

/**
 * Read-only lobby/account SQLite (`Account` table).
 * Reopens if COMP_LOBBY_DB path changes (tests / env swap).
 */
export function getLobbyDb(): DatabaseSync {
  const dbPath = getLobbyDbPath()
  if (cached && cached.path === dbPath) return cached.db

  if (!fs.existsSync(dbPath)) {
    throw new LobbyDbMissingError(dbPath)
  }

  const db = new DatabaseSync(dbPath, { readOnly: true })
  cached = { path: dbPath, db }
  return db
}

/** Test helper — drop cached connection. */
export function resetLobbyDbCache(): void {
  if (cached) {
    try {
      cached.db.close()
    } catch {
      /* ignore */
    }
  }
  cached = null
}

export class LobbyDbMissingError extends Error {
  constructor(dbPath: string) {
    super(`Lobby database not found at ${dbPath}`)
    this.name = "LobbyDbMissingError"
  }
}

/** Resolve Account.UID for a login username (exact match, lobby stores lowercase). */
export function lookupAccountUid(username: string): string | null {
  const name = username.trim().toLowerCase()
  if (!name) return null
  const row = getLobbyDb()
    .prepare(`SELECT UID FROM Account WHERE Username = ?`)
    .get(name) as { UID: string } | undefined
  return row?.UID ?? null
}
