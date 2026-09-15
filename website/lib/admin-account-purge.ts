import fs from "node:fs"

import { lookupAccountUid } from "@/lib/lobby-db"
import { DatabaseSync } from "@/lib/node-sqlite"
import { getWorldDbPath, resetWorldDbCache } from "@/lib/world-db"

const NULL_UUID = "00000000-0000-0000-0000-000000000000"

function withWorldWrite<T>(fn: (db: DatabaseSync) => T): T {
  const dbPath = getWorldDbPath()
  if (!fs.existsSync(dbPath)) {
    throw new Error(`World database file does not exist at ${dbPath}`)
  }
  // Drop any read-only cached handle before opening for write.
  resetWorldDbCache()
  const db = new DatabaseSync(dbPath)
  try {
    db.exec("PRAGMA busy_timeout = 5000")
    return fn(db)
  } finally {
    try {
      db.close()
    } catch {
      /* ignore */
    }
    resetWorldDbCache()
  }
}

function tableNames(db: DatabaseSync): string[] {
  return (
    db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY 1`
      )
      .all() as { name: string }[]
  ).map((r) => r.name)
}

function columnNames(db: DatabaseSync, table: string): string[] {
  return (
    db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as {
      name: string
    }[]
  ).map((r) => r.name)
}

function tryDelete(
  db: DatabaseSync,
  sql: string,
  params: string[],
  label: string,
  details: string[]
): number {
  try {
    const result = db.prepare(sql).run(...params) as { changes?: number }
    const n = Number(result.changes ?? 0)
    if (n > 0) details.push(`${label}:${n}`)
    return n
  } catch (err) {
    details.push(
      `${label}:ERR:${err instanceof Error ? err.message : String(err)}`
    )
    return 0
  }
}

export type AccountWorldPurgeResult = {
  accountUid: string
  characterNames: string[]
  charactersDeleted: number
  details: string[]
}

/**
 * Delete world-DB characters and related rows for a lobby Account.UID.
 * Lobby Account row is left alone — call lobby admin delete separately.
 */
export function purgeWorldDataForAccountUid(
  accountUid: string
): AccountWorldPurgeResult {
  const acct = accountUid.trim()
  if (!acct || acct === NULL_UUID) {
    return {
      accountUid: acct,
      characterNames: [],
      charactersDeleted: 0,
      details: [],
    }
  }

  return withWorldWrite((db) => {
    const details: string[] = []
    db.exec("BEGIN IMMEDIATE")
    try {
      const chars = db
        .prepare(`SELECT * FROM Character WHERE lower(Account) = lower(?)`)
        .all(acct) as Record<string, unknown>[]

      const characterNames = chars
        .map((c) => String(c.Name ?? "").trim())
        .filter(Boolean)

      const charUids = chars
        .map((c) => c.UID)
        .filter((u): u is string => typeof u === "string" && u.length > 0)

      // Character rows point at related tables via UID string columns.
      const uidTargets = new Set<string>([acct, ...charUids])
      for (const row of chars) {
        for (const [key, v] of Object.entries(row)) {
          if (key === "Name") continue
          if (typeof v !== "string") continue
          const s = v.trim()
          if (!s || s === NULL_UUID) continue
          uidTargets.add(s)
        }
      }

      // Items / demons live under boxes keyed by Account (and Character).
      const itemBoxUids = (
        db
          .prepare(
            `SELECT UID FROM ItemBox WHERE lower(Account) = lower(?)`
          )
          .all(acct) as { UID: string }[]
      ).map((r) => r.UID)

      for (const boxUid of itemBoxUids) {
        tryDelete(
          db,
          `DELETE FROM Item WHERE lower(ItemBox) = lower(?)`,
          [boxUid],
          `Item.ItemBox=${boxUid.slice(0, 8)}`,
          details
        )
      }

      const demonBoxUids = (
        db
          .prepare(
            `SELECT UID FROM DemonBox WHERE lower(Account) = lower(?)`
          )
          .all(acct) as { UID: string }[]
      ).map((r) => r.UID)

      for (const boxUid of demonBoxUids) {
        const demons = db
          .prepare(
            `SELECT UID FROM Demon WHERE lower(DemonBox) = lower(?)`
          )
          .all(boxUid) as { UID: string }[]
        for (const d of demons) {
          tryDelete(
            db,
            `DELETE FROM InheritedSkill WHERE lower(Demon) = lower(?)`,
            [d.UID],
            `InheritedSkill.Demon=${d.UID.slice(0, 8)}`,
            details
          )
        }
        tryDelete(
          db,
          `DELETE FROM Demon WHERE lower(DemonBox) = lower(?)`,
          [boxUid],
          `Demon.DemonBox=${boxUid.slice(0, 8)}`,
          details
        )
      }

      for (const table of tableNames(db)) {
        if (table === "Character") continue
        const cols = columnNames(db, table)
        const lower = new Map(cols.map((c) => [c.toLowerCase(), c]))

        if (lower.has("account")) {
          tryDelete(
            db,
            `DELETE FROM ${table} WHERE lower(Account) = lower(?)`,
            [acct],
            `${table}.Account`,
            details
          )
        }

        for (const charUid of charUids) {
          if (lower.has("character")) {
            tryDelete(
              db,
              `DELETE FROM ${table} WHERE lower(Character) = lower(?)`,
              [charUid],
              `${table}.Character=${charUid.slice(0, 8)}`,
              details
            )
          }
          if (lower.has("owner")) {
            tryDelete(
              db,
              `DELETE FROM ${table} WHERE lower(Owner) = lower(?)`,
              [charUid],
              `${table}.Owner=${charUid.slice(0, 8)}`,
              details
            )
          }
        }

        const uidCol = lower.get("uid")
        if (uidCol) {
          for (const target of uidTargets) {
            // Account UID deletes are handled via Account column / explicit
            // account-scoped tables below — skip here to avoid odd collisions.
            if (target.toLowerCase() === acct.toLowerCase()) continue
            tryDelete(
              db,
              `DELETE FROM ${table} WHERE lower(${uidCol}) = lower(?)`,
              [target],
              `${table}.${uidCol}=${target.slice(0, 8)}`,
              details
            )
          }
        }
      }

      // Account-scoped UID rows (e.g. AccountWorldData.UID may equal Account).
      for (const table of ["AccountWorldData", "ChatLogEntry", "BazaarItem"]) {
        if (!tableNames(db).includes(table)) continue
        const cols = columnNames(db, table)
        if (cols.some((c) => c.toLowerCase() === "uid")) {
          tryDelete(
            db,
            `DELETE FROM ${table} WHERE lower(UID) = lower(?)`,
            [acct],
            `${table}.UID=account`,
            details
          )
        }
      }

      let charactersDeleted = 0
      for (const charUid of charUids) {
        charactersDeleted += tryDelete(
          db,
          `DELETE FROM Character WHERE lower(UID) = lower(?)`,
          [charUid],
          `Character.UID=${charUid.slice(0, 8)}`,
          details
        )
      }
      charactersDeleted += tryDelete(
        db,
        `DELETE FROM Character WHERE lower(Account) = lower(?)`,
        [acct],
        "Character.Account",
        details
      )

      db.exec("COMMIT")
      return {
        accountUid: acct,
        characterNames,
        charactersDeleted,
        details,
      }
    } catch (err) {
      try {
        db.exec("ROLLBACK")
      } catch {
        /* ignore */
      }
      throw err
    }
  })
}

/**
 * Resolve lobby username → Account.UID, then purge world characters.
 * Returns null when the username is unknown to lobby DB.
 */
export function purgeWorldDataForUsername(
  username: string
): AccountWorldPurgeResult | null {
  const accountUid = lookupAccountUid(username)
  if (!accountUid) return null
  return purgeWorldDataForAccountUid(accountUid)
}
