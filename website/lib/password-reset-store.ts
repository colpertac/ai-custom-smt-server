import { createHash, randomBytes } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { DatabaseSync } from "./node-sqlite"

const DEFAULT_TTL_MS = 60 * 60 * 1000

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
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_reset_username ON password_reset_tokens(username);
  `)
  return db
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

/** Create a one-time reset token (raw value emailed; only hash stored). */
export function createPasswordResetToken(
  username: string,
  ttlMs = DEFAULT_TTL_MS
): { token: string; expiresAt: number } {
  const normalized = username.toLowerCase()
  const database = getDb()
  const now = Date.now()

  database
    .prepare(
      `DELETE FROM password_reset_tokens WHERE username = ? OR expires_at < ?`
    )
    .run(normalized, now)

  const token = randomBytes(32).toString("hex")
  const expiresAt = now + ttlMs
  database
    .prepare(
      `INSERT INTO password_reset_tokens (token_hash, username, expires_at, used_at)
       VALUES (?, ?, ?, NULL)`
    )
    .run(hashToken(token), normalized, expiresAt)

  return { token, expiresAt }
}

export type ConsumedResetToken = {
  username: string
}

/** Validate and consume a token. Returns null if invalid/expired/used. */
export function consumePasswordResetToken(
  token: string
): ConsumedResetToken | null {
  if (!token || token.length < 32) return null
  const database = getDb()
  const now = Date.now()
  const tokenHash = hashToken(token)

  const row = database
    .prepare(
      `SELECT username, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?`
    )
    .get(tokenHash) as
    | { username: string; expires_at: number; used_at: number | null }
    | undefined

  if (!row || row.used_at != null || row.expires_at < now) {
    return null
  }

  database
    .prepare(`UPDATE password_reset_tokens SET used_at = ? WHERE token_hash = ?`)
    .run(now, tokenHash)

  return { username: row.username }
}

/** Test helper */
export function resetPasswordResetStoreForTests(): void {
  if (db) {
    db.close()
    db = null
  }
  const file = dbPath()
  if (fs.existsSync(file)) fs.unlinkSync(file)
}
