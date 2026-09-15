import fs from "node:fs"

import { getLobbyDbPath } from "@/lib/lobby-db"
import { appendCharactersBlob } from "@/lib/character-import/slots"
import { getWorldDbPath } from "@/lib/world-db"
import { DatabaseSync } from "@/lib/node-sqlite"

function withDbWrite<T>(dbPath: string, fn: (db: DatabaseSync) => T): T {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file does not exist at ${dbPath}`)
  }
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
  }
}

export type AttachResult = {
  attachedUuids: string[]
}

/**
 * After lobby import of an ephemeral account, move characters onto the
 * destination login and delete the ephemeral Account row.
 */
export function attachImportedCharacters(opts: {
  destinationUsername: string
  ephemeralUsername: string
  characterUuids: string[]
}): AttachResult {
  const lobbyPath = getLobbyDbPath()
  const worldPath = getWorldDbPath()
  const destName = opts.destinationUsername.trim().toLowerCase()
  const ephName = opts.ephemeralUsername.trim().toLowerCase()
  const charUuids = opts.characterUuids.map((u) => u.toLowerCase())

  return withDbWrite(lobbyPath, (lobbyDb) =>
    withDbWrite(worldPath, (worldDb) => {
      lobbyDb.exec("BEGIN IMMEDIATE")
      worldDb.exec("BEGIN IMMEDIATE")
      try {
        const dest = lobbyDb
          .prepare(
            `SELECT UID, Characters FROM Account WHERE Username = ?`
          )
          .get(destName) as
          | { UID: string; Characters: Uint8Array | Buffer | null }
          | undefined
        if (!dest) {
          throw new Error("Destination account not found")
        }

        const eph = lobbyDb
          .prepare(
            `SELECT UID FROM Account WHERE Username = ?`
          )
          .get(ephName) as { UID: string } | undefined
        if (!eph) {
          throw new Error(
            "Ephemeral import account missing — lobby import may have failed"
          )
        }

        for (const uid of charUuids) {
          const row = worldDb
            .prepare(`SELECT UID, Account FROM Character WHERE lower(UID) = ?`)
            .get(uid) as { UID: string; Account: string } | undefined
          if (!row) {
            throw new Error(`Imported character ${uid} not found in world DB`)
          }
        }

        // Reassign world FKs from ephemeral account → destination
        worldDb
          .prepare(
            `UPDATE Character SET Account = ? WHERE lower(Account) = lower(?)`
          )
          .run(dest.UID, eph.UID)
        worldDb
          .prepare(
            `UPDATE ItemBox SET Account = ? WHERE lower(Account) = lower(?)`
          )
          .run(dest.UID, eph.UID)
        try {
          worldDb
            .prepare(
              `UPDATE DemonBox SET Account = ? WHERE lower(Account) = lower(?)`
            )
            .run(dest.UID, eph.UID)
        } catch {
          /* DemonBox.Account may be absent on older schemas — ignore */
        }

        const updatedChars = appendCharactersBlob(dest.Characters, charUuids)
        lobbyDb
          .prepare(`UPDATE Account SET Characters = ? WHERE UID = ?`)
          .run(updatedChars, dest.UID)

        lobbyDb.prepare(`DELETE FROM Account WHERE UID = ?`).run(eph.UID)

        worldDb.exec("COMMIT")
        lobbyDb.exec("COMMIT")
        return { attachedUuids: charUuids }
      } catch (err) {
        try {
          worldDb.exec("ROLLBACK")
        } catch {
          /* ignore */
        }
        try {
          lobbyDb.exec("ROLLBACK")
        } catch {
          /* ignore */
        }
        throw err
      }
    })
  )
}

/** Best-effort cleanup when attach fails after a successful lobby import. */
export function rollbackEphemeralImport(opts: {
  ephemeralUsername: string
  characterUuids: string[]
}): void {
  const lobbyPath = getLobbyDbPath()
  const worldPath = getWorldDbPath()
  const ephName = opts.ephemeralUsername.trim().toLowerCase()
  const charUuids = opts.characterUuids.map((u) => u.toLowerCase())

  try {
    withDbWrite(lobbyPath, (lobbyDb) =>
      withDbWrite(worldPath, (worldDb) => {
        const eph = lobbyDb
          .prepare(`SELECT UID FROM Account WHERE Username = ?`)
          .get(ephName) as { UID: string } | undefined

        for (const uid of charUuids) {
          // Delete character-owned rows we can key; leave orphans only if unknown
          try {
            worldDb.prepare(`DELETE FROM Character WHERE lower(UID) = ?`).run(uid)
          } catch {
            /* ignore */
          }
        }

        if (eph) {
          try {
            worldDb
              .prepare(`DELETE FROM ItemBox WHERE lower(Account) = lower(?)`)
              .run(eph.UID)
          } catch {
            /* ignore */
          }
          try {
            worldDb
              .prepare(`DELETE FROM DemonBox WHERE lower(Account) = lower(?)`)
              .run(eph.UID)
          } catch {
            /* ignore */
          }
          try {
            worldDb
              .prepare(`DELETE FROM Character WHERE lower(Account) = lower(?)`)
              .run(eph.UID)
          } catch {
            /* ignore */
          }
          lobbyDb.prepare(`DELETE FROM Account WHERE UID = ?`).run(eph.UID)
        }
      })
    )
  } catch {
    /* best effort */
  }
}
