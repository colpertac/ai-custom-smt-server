/**
 * Offline world-DB mutations for expertise points and digi levels.
 * Characters must not be in-channel; callers should refuse when live stats say online.
 */
import crypto from "node:crypto"
import fs from "node:fs"

import {
  expertiseMaxPoints,
  getExpertiseMeta,
  getExpertiseName,
  parseExpertiseProgress,
} from "@/lib/armory-catalogs"
import {
  DIGITALIZE_LEVEL_MAX,
  GUARDIAN_RACE_IDS,
  getGuardianRaceName,
  type CharacterEditState,
  type EditableDigitalize,
  type EditableExpertise,
  type OwnedCharacterRow,
} from "@/lib/character-expertise-digi-shared"
import {
  decodeU8S32Map,
  decodeU8S8Map,
  encodeU8S32Map,
  encodeU8S8Map,
} from "@/lib/digitalize-map"
import { lookupAccountUid } from "@/lib/lobby-db"
import { DatabaseSync } from "@/lib/node-sqlite"
import { getWorldDb, getWorldDbPath, resetWorldDbCache } from "@/lib/world-db"

export {
  DIGITALIZE_LEVEL_MAX,
  GUARDIAN_RACE_IDS,
  getGuardianRaceName,
  type CharacterEditState,
  type EditableDigitalize,
  type EditableExpertise,
  type OwnedCharacterRow,
} from "@/lib/character-expertise-digi-shared"

const EXPERTISE_SLOT_COUNT = 38
const EXPERTISE_BLOB_BYTES = EXPERTISE_SLOT_COUNT * 16

function withWorldWrite<T>(fn: (db: DatabaseSync) => T): T {
  const dbPath = getWorldDbPath()
  if (!fs.existsSync(dbPath)) {
    throw new Error(`World database file does not exist at ${dbPath}`)
  }
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

function uuidTo16Bytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex")
}

function pointsFromClassRank(classLevel: number, rank: number): number {
  return (
    Math.max(0, Math.floor(classLevel)) * 100_000 +
    Math.max(0, Math.floor(rank)) * 10_000
  )
}

export function listOwnedCharacters(
  username: string
): OwnedCharacterRow[] | null {
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

export function characterOwnedByUsername(
  characterName: string,
  username: string
): boolean {
  const accountUid = lookupAccountUid(username)
  if (!accountUid) return false
  const row = getWorldDb()
    .prepare(
      `SELECT Account FROM Character WHERE Name = ? COLLATE NOCASE LIMIT 1`
    )
    .get(characterName.trim()) as { Account: string } | undefined
  return Boolean(row && row.Account === accountUid)
}

function loadEditStateFromDb(
  db: DatabaseSync,
  characterName: string
): CharacterEditState | null {
  const char = db
    .prepare(
      `SELECT UID FROM Character WHERE Name = ? COLLATE NOCASE LIMIT 1`
    )
    .get(characterName.trim()) as { UID: string } | undefined
  if (!char) return null

  const expRows = db
    .prepare(
      `SELECT ExpertiseID, Points, Disabled FROM Expertise
       WHERE Character = ? ORDER BY ExpertiseID ASC`
    )
    .all(char.UID) as {
    ExpertiseID: number
    Points: number
    Disabled: number
  }[]

  const byId = new Map(expRows.map((e) => [e.ExpertiseID, e]))
  const expertises: EditableExpertise[] = []
  for (let id = 0; id < EXPERTISE_SLOT_COUNT; id++) {
    const meta = getExpertiseMeta(id)
    if (meta.isChain) continue
    if (meta.implemented === false) continue
    const row = byId.get(id)
    const points = row?.Points ?? 0
    const prog = parseExpertiseProgress(points, meta.maxClass, meta.maxRank)
    expertises.push({
      id,
      name: getExpertiseName(id),
      points,
      classLevel: prog.classLevel,
      rank: prog.rank,
      maxClass: meta.maxClass,
      maxRank: meta.maxRank,
      maxPoints: prog.maxPoints,
      disabled: Boolean(row?.Disabled),
    })
  }

  const progress = db
    .prepare(
      `SELECT DigitalizeLevels, DigitalizePoints FROM CharacterProgress
       WHERE Character = ? LIMIT 1`
    )
    .get(char.UID) as
    | {
        DigitalizeLevels: Uint8Array | Buffer | null
        DigitalizePoints: Uint8Array | Buffer | null
      }
    | undefined

  const levels = decodeU8S8Map(progress?.DigitalizeLevels ?? null)
  const points = decodeU8S32Map(progress?.DigitalizePoints ?? null)
  const digitalize: EditableDigitalize[] = GUARDIAN_RACE_IDS.map((raceId) => ({
    raceId,
    name: getGuardianRaceName(raceId),
    level: levels.get(raceId) ?? 0,
    points: points.get(raceId) ?? 0,
  }))

  return {
    characterName:
      (
        db
          .prepare(`SELECT Name FROM Character WHERE UID = ?`)
          .get(char.UID) as { Name: string } | undefined
      )?.Name ?? characterName,
    expertises,
    digitalize,
  }
}

export function loadCharacterEditState(
  characterName: string
): CharacterEditState | null {
  return loadEditStateFromDb(getWorldDb(), characterName)
}

export type ExpertiseUpdate = {
  expertiseId: number
  classLevel?: number
  rank?: number
  points?: number
}

export function applyExpertiseUpdates(
  characterName: string,
  updates: ExpertiseUpdate[]
): CharacterEditState {
  if (!updates.length) {
    const state = loadCharacterEditState(characterName)
    if (!state) throw new Error("Character not found")
    return state
  }

  return withWorldWrite((db) => {
    const char = db
      .prepare(
        `SELECT UID, Expertises FROM Character WHERE Name = ? COLLATE NOCASE LIMIT 1`
      )
      .get(characterName.trim()) as
      | { UID: string; Expertises: Uint8Array | Buffer | null }
      | undefined
    if (!char) throw new Error("Character not found")

    const blob = Buffer.alloc(EXPERTISE_BLOB_BYTES)
    if (char.Expertises && char.Expertises.length > 0) {
      Buffer.from(char.Expertises).copy(
        blob,
        0,
        0,
        Math.min(EXPERTISE_BLOB_BYTES, char.Expertises.length)
      )
    }
    let blobDirty = false

    const updateStmt = db.prepare(
      `UPDATE Expertise SET Points = ? WHERE Character = ? AND ExpertiseID = ?`
    )
    const insertStmt = db.prepare(
      `INSERT INTO Expertise (UID, Character, ExpertiseID, Points, Disabled)
       VALUES (?, ?, ?, ?, 0)`
    )
    const selectStmt = db.prepare(
      `SELECT UID FROM Expertise WHERE Character = ? AND ExpertiseID = ? LIMIT 1`
    )

    for (const upd of updates) {
      const id = Math.floor(upd.expertiseId)
      if (id < 0 || id >= EXPERTISE_SLOT_COUNT) {
        throw new Error(`Invalid expertise id ${id}`)
      }
      const meta = getExpertiseMeta(id)
      if (meta.isChain) {
        throw new Error(`Expertise ${id} is chain-derived and cannot be set`)
      }
      if (meta.implemented === false) {
        throw new Error(`Expertise ${id} is not implemented`)
      }

      const maxPoints = expertiseMaxPoints(meta.maxClass, meta.maxRank)
      let points: number
      if (upd.points != null) {
        points = Math.floor(upd.points)
      } else if (upd.classLevel != null || upd.rank != null) {
        points = pointsFromClassRank(upd.classLevel ?? 0, upd.rank ?? 0)
      } else {
        throw new Error(`Expertise ${id}: need points or classLevel/rank`)
      }
      points = Math.max(0, Math.min(maxPoints, points))

      const existing = selectStmt.get(char.UID, id) as
        | { UID: string }
        | undefined
      if (existing) {
        updateStmt.run(points, char.UID, id)
      } else {
        const uid = crypto.randomUUID()
        insertStmt.run(uid, char.UID, id, points)
        uuidTo16Bytes(uid).copy(blob, id * 16)
        blobDirty = true
      }
    }

    if (blobDirty) {
      db.prepare(`UPDATE Character SET Expertises = ? WHERE UID = ?`).run(
        blob,
        char.UID
      )
    }

    const state = loadEditStateFromDb(db, characterName)
    if (!state) throw new Error("Character not found after update")
    return state
  })
}

export type DigitalizeUpdate = {
  raceId: number
  level: number
  points?: number
}

export function applyDigitalizeUpdates(
  characterName: string,
  updates: DigitalizeUpdate[]
): CharacterEditState {
  if (!updates.length) {
    const state = loadCharacterEditState(characterName)
    if (!state) throw new Error("Character not found")
    return state
  }

  const allowed = new Set(GUARDIAN_RACE_IDS)

  return withWorldWrite((db) => {
    const char = db
      .prepare(
        `SELECT UID FROM Character WHERE Name = ? COLLATE NOCASE LIMIT 1`
      )
      .get(characterName.trim()) as { UID: string } | undefined
    if (!char) throw new Error("Character not found")

    const progress = db
      .prepare(
        `SELECT UID, DigitalizeLevels, DigitalizePoints FROM CharacterProgress
         WHERE Character = ? LIMIT 1`
      )
      .get(char.UID) as
      | {
          UID: string
          DigitalizeLevels: Uint8Array | Buffer | null
          DigitalizePoints: Uint8Array | Buffer | null
        }
      | undefined
    if (!progress) throw new Error("Character progress not found")

    const levels = decodeU8S8Map(progress.DigitalizeLevels)
    const points = decodeU8S32Map(progress.DigitalizePoints)

    for (const upd of updates) {
      const raceId = Math.floor(upd.raceId)
      if (!allowed.has(raceId)) {
        throw new Error(`Invalid digi race ${raceId}`)
      }
      const level = Math.max(
        0,
        Math.min(DIGITALIZE_LEVEL_MAX, Math.floor(upd.level))
      )
      if (level <= 0) {
        levels.delete(raceId)
        points.delete(raceId)
      } else {
        levels.set(raceId, level)
        if (upd.points != null) {
          points.set(raceId, Math.max(0, Math.floor(upd.points)))
        } else if (!points.has(raceId)) {
          points.set(raceId, 0)
        }
      }
    }

    db.prepare(
      `UPDATE CharacterProgress SET DigitalizeLevels = ?, DigitalizePoints = ?
       WHERE UID = ?`
    ).run(encodeU8S8Map(levels), encodeU8S32Map(points), progress.UID)

    const state = loadEditStateFromDb(db, characterName)
    if (!state) throw new Error("Character not found after update")
    return state
  })
}
