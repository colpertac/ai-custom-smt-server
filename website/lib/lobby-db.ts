import { timingSafeEqual } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { isAdminLevel } from "@/lib/admin-level"
import { passwordHash } from "@/lib/sha512"

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

export type LobbyAccountAuthRow = {
  username: string
  password: string
  salt: string
  userLevel: number
  enabled: boolean
  dispName: string
}

type AccountAuthSqlRow = {
  Username: string
  Password: string
  Salt: string
  UserLevel: number | null
  Enabled: number | null
  DisplayName: string | null
}

/** Lookup Account auth fields for offline verify (exact lowercase username). */
export function lookupAccountAuth(
  username: string
): LobbyAccountAuthRow | null {
  const name = username.trim().toLowerCase()
  if (!name) return null

  const row = getLobbyDb()
    .prepare(
      `SELECT Username, Password, Salt, UserLevel, Enabled, DisplayName
       FROM Account WHERE Username = ?`
    )
    .get(name) as AccountAuthSqlRow | undefined

  if (!row) return null

  return {
    username: row.Username,
    password: String(row.Password ?? ""),
    salt: String(row.Salt ?? ""),
    userLevel: typeof row.UserLevel === "number" ? row.UserLevel : 0,
    enabled: Boolean(row.Enabled),
    dispName:
      typeof row.DisplayName === "string" && row.DisplayName.trim()
        ? row.DisplayName
        : row.Username,
  }
}

export type OfflineAdminVerifyFail =
  | "missing_db"
  | "not_found"
  | "disabled"
  | "not_admin"
  | "bad_password"

export type OfflineAdminVerifyResult =
  | {
      ok: true
      username: string
      passwordHash: string
      userLevel: number
      dispName: string
    }
  | { ok: false; reason: OfflineAdminVerifyFail }

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"))
  } catch {
    return false
  }
}

/**
 * Verify an enabled admin against lobby Account SQLite (COMP API offline).
 * Fail reasons are for tests/logs — callers must not leak them to clients.
 */
export function verifyLobbyAdminPassword(
  username: string,
  password: string
): OfflineAdminVerifyResult {
  let row: LobbyAccountAuthRow | null
  try {
    row = lookupAccountAuth(username)
  } catch (error) {
    if (error instanceof LobbyDbMissingError) {
      return { ok: false, reason: "missing_db" }
    }
    throw error
  }

  if (!row) return { ok: false, reason: "not_found" }
  if (!row.enabled) return { ok: false, reason: "disabled" }
  if (!isAdminLevel(row.userLevel)) return { ok: false, reason: "not_admin" }

  const computed = passwordHash(password, row.salt)
  if (!timingSafeEqualHex(computed, row.password)) {
    return { ok: false, reason: "bad_password" }
  }

  return {
    ok: true,
    username: row.username,
    passwordHash: row.password,
    userLevel: row.userLevel,
    dispName: row.dispName,
  }
}
