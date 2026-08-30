import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"

export function getWorldDbPath(): string {
  const custom = process.env.COMP_WORLD_DB?.trim()
  if (custom) return path.resolve(custom)
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../comp_hack/runtime/database/world.sqlite3"
  )
}

let cached: { path: string; db: DatabaseSync } | null = null

/**
 * Read-only world SQLite (Character / Item / Clan / EntityStats).
 * Reopens if COMP_WORLD_DB path changes (tests / env swap).
 */
export function getWorldDb(): DatabaseSync {
  const dbPath = getWorldDbPath()
  if (cached && cached.path === dbPath) return cached.db

  if (!fs.existsSync(dbPath)) {
    throw new WorldDbMissingError(dbPath)
  }

  const db = new DatabaseSync(dbPath, { readOnly: true })
  cached = { path: dbPath, db }
  return db
}

/** Test helper — drop cached connection. */
export function resetWorldDbCache(): void {
  if (cached) {
    try {
      cached.db.close()
    } catch {
      /* ignore */
    }
  }
  cached = null
}

export class WorldDbMissingError extends Error {
  constructor(dbPath: string) {
    super(`World database not found at ${dbPath}`)
    this.name = "WorldDbMissingError"
  }
}
