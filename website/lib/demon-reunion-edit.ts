/**
 * Offline world-DB mutations for demon reunion / mitama fields.
 * Demons must not be loaded in-channel; callers refuse when owners are online.
 */
import fs from "node:fs"

import { isValidDemonId } from "@/lib/armory-demons"
import { getDevilName } from "@/lib/devil-catalog"
import {
  MITAMA_BONUS_ID_MAX,
  MITAMA_RANK_MAX,
  MITAMA_REUNION_SLOT_COUNT,
  REUNION_BRANCH_COUNT,
  REUNION_RANK_MAX,
  clampMitamaSlotsToReunionRanks,
  type DemonEditState,
  type DemonReunionApplyPayload,
} from "@/lib/demon-reunion-edit-shared"
import { clampGrowthType } from "@/lib/growth-type-catalog"
import { listOwnedCharacters } from "@/lib/character-expertise-digi"
import { lookupAccountUid } from "@/lib/lobby-db"
import { DatabaseSync } from "@/lib/node-sqlite"
import { getWorldDb, getWorldDbPath, resetWorldDbCache } from "@/lib/world-db"

export type {
  DemonEditState,
  DemonReunionApplyPayload,
} from "@/lib/demon-reunion-edit-shared"

const NULL_UUID = "00000000-0000-0000-0000-000000000000"

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

function decodeS8Array(
  blob: Uint8Array | Buffer | null | undefined,
  count: number
): number[] {
  const out = Array.from({ length: count }, () => 0)
  if (!blob) return out
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  const n = Math.min(count, buf.length)
  for (let i = 0; i < n; i++) {
    const v = buf[i]!
    out[i] = v > 127 ? v - 256 : v
  }
  return out
}

function decodeU8Array(
  blob: Uint8Array | Buffer | null | undefined,
  count: number
): number[] {
  const out = Array.from({ length: count }, () => 0)
  if (!blob) return out
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  const n = Math.min(count, buf.length)
  for (let i = 0; i < n; i++) out[i] = buf[i]!
  return out
}

function encodeS8Array(values: number[], count: number): Buffer {
  const buf = Buffer.alloc(count)
  for (let i = 0; i < count; i++) {
    let v = Math.floor(Number(values[i]) || 0)
    v = Math.max(-128, Math.min(127, v))
    buf[i] = v < 0 ? v + 256 : v
  }
  return buf
}

function encodeU8Array(values: number[], count: number): Buffer {
  const buf = Buffer.alloc(count)
  for (let i = 0; i < count; i++) {
    const v = Math.max(0, Math.min(255, Math.floor(Number(values[i]) || 0)))
    buf[i] = v
  }
  return buf
}

type DemonOwnerRow = {
  UID: string
  Type: number
  DemonBox: string
  MitamaRank: number
  MitamaType: number
  GrowthType: number
  Reunion: Uint8Array | Buffer | null
  MitamaReunion: Uint8Array | Buffer | null
  BoxAccount: string | null
  BoxCharacter: string | null
  /** Character.Account when in a COMP; null for account storage. */
  CharAccount: string | null
  OwnerName: string | null
}

function isUnsetUuid(uid: string | null | undefined): boolean {
  if (uid == null || uid === "") return true
  const lower = uid.toLowerCase()
  // COMP DemonBox.Account is often a placeholder like …000a01, not the lobby UID.
  return (
    lower === NULL_UUID ||
    lower === "00000000-0000-0000-0000-000000000a01" ||
    /^00000000-0000-0000-0000-00000000[0-9a-f]{4}$/i.test(lower)
  )
}

/** Effective owning lobby Account UID for a demon box row. */
function owningAccountUid(row: DemonOwnerRow): string | null {
  if (row.BoxCharacter && !isUnsetUuid(row.BoxCharacter)) {
    if (row.CharAccount && !isUnsetUuid(row.CharAccount)) return row.CharAccount
    return null
  }
  if (row.BoxAccount && !isUnsetUuid(row.BoxAccount)) return row.BoxAccount
  return null
}

function loadDemonOwnerRow(
  db: DatabaseSync,
  demonId: string
): DemonOwnerRow | null {
  const id = demonId.trim().toLowerCase()
  if (!isValidDemonId(id)) return null

  return (
    (db
      .prepare(
        `SELECT d.UID, d.Type, d.DemonBox, d.MitamaRank, d.MitamaType,
                d.GrowthType, d.Reunion, d.MitamaReunion,
                b.Account AS BoxAccount, b.Character AS BoxCharacter,
                c.Account AS CharAccount, c.Name AS OwnerName
         FROM Demon d
         LEFT JOIN DemonBox b ON b.UID = d.DemonBox
         LEFT JOIN Character c ON c.UID = b.Character
         WHERE lower(d.UID) = ?`
      )
      .get(id) as DemonOwnerRow | undefined) ?? null
  )
}

function locationFromBox(
  boxCharacter: string | null | undefined
): DemonEditState["location"] {
  if (boxCharacter && boxCharacter !== NULL_UUID) return "comp"
  if (boxCharacter != null) return "account_storage"
  return "unknown"
}

function stateFromRow(row: DemonOwnerRow): DemonEditState {
  return {
    demonId: row.UID,
    name: getDevilName(row.Type),
    type: row.Type,
    ownerCharacter:
      row.OwnerName && row.BoxCharacter && row.BoxCharacter !== NULL_UUID
        ? row.OwnerName
        : null,
    location: locationFromBox(row.BoxCharacter),
    reunion: decodeS8Array(row.Reunion, REUNION_BRANCH_COUNT).map((r) =>
      Math.max(0, Math.min(REUNION_RANK_MAX, r))
    ),
    mitamaReunion: decodeU8Array(row.MitamaReunion, MITAMA_REUNION_SLOT_COUNT),
    mitamaRank: Math.max(
      0,
      Math.min(MITAMA_RANK_MAX, Math.floor(row.MitamaRank || 0))
    ),
    mitamaType: Math.max(0, Math.min(4, Math.floor(row.MitamaType || 0))),
    growthType: clampGrowthType(row.GrowthType || 0),
  }
}

/**
 * True when this login owns the demon.
 * COMP demons: Character.Account (DemonBox.Account is often a placeholder).
 * Account storage: DemonBox.Account.
 */
export function demonOwnedByUsername(
  demonId: string,
  username: string
): boolean {
  const accountUid = lookupAccountUid(username)
  if (!accountUid) return false
  const row = loadDemonOwnerRow(getWorldDb(), demonId)
  if (!row) return false
  const owner = owningAccountUid(row)
  if (!owner) return false
  return owner.toLowerCase() === accountUid.toLowerCase()
}

export function loadDemonEditState(demonId: string): DemonEditState | null {
  const row = loadDemonOwnerRow(getWorldDb(), demonId)
  if (!row) return null
  return stateFromRow(row)
}

/**
 * Character names that must be offline before editing this demon.
 * COMP → owning character; account storage → all characters on the account.
 */
export function demonOfflineCheckNames(
  demonId: string,
  username: string
): string[] {
  const row = loadDemonOwnerRow(getWorldDb(), demonId)
  if (!row) return []

  if (row.OwnerName && row.BoxCharacter && row.BoxCharacter !== NULL_UUID) {
    return [row.OwnerName]
  }

  const owned = listOwnedCharacters(username)
  return owned?.map((c) => c.name) ?? []
}

function clampReunion(values: number[]): number[] {
  const out = Array.from({ length: REUNION_BRANCH_COUNT }, () => 0)
  for (let i = 0; i < REUNION_BRANCH_COUNT; i++) {
    out[i] = Math.max(
      0,
      Math.min(REUNION_RANK_MAX, Math.floor(Number(values[i]) || 0))
    )
  }
  return out
}

function clampMitamaReunion(values: number[]): number[] {
  const out = Array.from({ length: MITAMA_REUNION_SLOT_COUNT }, () => 0)
  for (let i = 0; i < MITAMA_REUNION_SLOT_COUNT; i++) {
    out[i] = Math.max(
      0,
      Math.min(MITAMA_BONUS_ID_MAX, Math.floor(Number(values[i]) || 0))
    )
  }
  return out
}

export function applyDemonReunionUpdates(
  demonId: string,
  payload: DemonReunionApplyPayload
): DemonEditState {
  const id = demonId.trim().toLowerCase()
  if (!isValidDemonId(id)) throw new Error("Invalid demon id")

  if (
    !Array.isArray(payload.reunion) ||
    payload.reunion.length !== REUNION_BRANCH_COUNT
  ) {
    throw new Error(`reunion must be length ${REUNION_BRANCH_COUNT}`)
  }
  if (
    !Array.isArray(payload.mitamaReunion) ||
    payload.mitamaReunion.length !== MITAMA_REUNION_SLOT_COUNT
  ) {
    throw new Error(
      `mitamaReunion must be length ${MITAMA_REUNION_SLOT_COUNT}`
    )
  }

  const reunion = clampReunion(payload.reunion)
  const mitamaReunion = clampMitamaSlotsToReunionRanks(
    clampMitamaReunion(payload.mitamaReunion),
    reunion
  )
  const mitamaRank = Math.max(
    0,
    Math.min(MITAMA_RANK_MAX, Math.floor(payload.mitamaRank))
  )
  const mitamaType = Math.max(
    0,
    Math.min(4, Math.floor(payload.mitamaType))
  )
  const growthType = clampGrowthType(payload.growthType)

  return withWorldWrite((db) => {
    const row = loadDemonOwnerRow(db, id)
    if (!row) throw new Error("Demon not found")

    db.prepare(
      `UPDATE Demon
       SET Reunion = ?, MitamaReunion = ?, MitamaRank = ?, MitamaType = ?,
           GrowthType = ?
       WHERE lower(UID) = ?`
    ).run(
      encodeS8Array(reunion, REUNION_BRANCH_COUNT),
      encodeU8Array(mitamaReunion, MITAMA_REUNION_SLOT_COUNT),
      mitamaRank,
      mitamaType,
      growthType,
      id
    )

    const next = loadDemonOwnerRow(db, id)
    if (!next) throw new Error("Demon not found after update")
    return stateFromRow(next)
  })
}
