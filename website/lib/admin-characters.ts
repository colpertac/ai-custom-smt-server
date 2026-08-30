import { lookupAccountUid, LobbyDbMissingError } from "@/lib/lobby-db"
import { getWorldDb, WorldDbMissingError } from "@/lib/world-db"

export { LobbyDbMissingError, WorldDbMissingError }

export type AdminCharacterSummary = {
  name: string
  level: number
  gender: number
  lastLogin: number
}

/**
 * Characters for a lobby login username (world DB by Account UID).
 * Returns null when the account username is unknown to lobby DB.
 */
export function listCharactersByUsername(
  username: string
): AdminCharacterSummary[] | null {
  const accountUid = lookupAccountUid(username)
  if (!accountUid) return null

  const rows = getWorldDb()
    .prepare(
      `SELECT c.Name, c.Gender, c.LastLogin, e.Level
       FROM Character c
       LEFT JOIN EntityStats e ON e.UID = c.CoreStats
       WHERE c.Account = ?
       ORDER BY c.Name COLLATE NOCASE ASC`
    )
    .all(accountUid) as {
    Name: string
    Gender: number
    LastLogin: number
    Level: number | null
  }[]

  return rows.map((r) => ({
    name: r.Name,
    level: r.Level ?? 0,
    gender: r.Gender ?? 0,
    lastLogin: r.LastLogin ?? 0,
  }))
}

/** All character names on the world (for admin autocomplete). */
export function listAllCharacterNames(): string[] {
  const rows = getWorldDb()
    .prepare(
      `SELECT Name FROM Character WHERE Name IS NOT NULL AND Name != ''
       ORDER BY Name COLLATE NOCASE ASC`
    )
    .all() as { Name: string }[]

  return rows.map((r) => r.Name).filter(Boolean)
}
