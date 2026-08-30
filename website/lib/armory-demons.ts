import { getWikiItem } from "@/content/wiki"
import { getDevilName } from "@/lib/armory-catalogs"
import {
  isValidCharacterName,
  uuidBytesToString,
  type ArmoryStats,
  WorldDbMissingError,
} from "@/lib/armory"
import { getWorldDb } from "@/lib/world-db"

export { WorldDbMissingError }

const NULL_UUID = "00000000-0000-0000-0000-000000000000"
const DEMON_EQUIP_SLOTS = 4

export type ArmoryDemonGear = {
  slot: number
  label: string
  itemType: number | null
  name: string | null
  /** Tarot crystal enchant id (0 = none). */
  tarot: number
  /** Soul crystal enchant id (0 = none). */
  soul: number
  basicEffect: number
  specialEffect: number
  modSlots: number[]
}

const DEMON_EQUIP_LABELS = ["Equip 1", "Equip 2", "Equip 3", "Equip 4"] as const

export type ArmoryDemonDetail = {
  id: string
  type: number
  name: string
  boxSlot: number
  familiarity: number
  growthType: number
  mitamaRank: number
  mitamaType: number
  magReduction: number
  soulPoints: number
  locked: boolean
  active: boolean
  skills: number[]
  /** Inherited skill IDs with fusion progress. */
  inheritedSkills: { skillId: number; progress: number }[]
  stats: ArmoryStats | null
  equipment: ArmoryDemonGear[]
  /** 12 reunion growth-group ranks (s8). */
  reunion: number[]
  /** Sum of ranks capped at 8 each (matches server reunion total helper). */
  reunionTotal: number
  /** Mitama reunion bonuses: 12 groups × 8 ranks (u8). */
  mitamaReunion: number[]
  forceValues: number[]
  forceStack: number[]
  /** Owning character name when in a COMP; null if account storage. */
  ownerCharacter: string | null
  location: "comp" | "account_storage" | "unknown"
}

export type ArmoryDemon = {
  /** Opaque id for React keys — not an account leak. */
  id: string
  type: number
  name: string
  boxSlot: number
  familiarity: number
  growthType: number
  mitamaRank: number
  locked: boolean
  active: boolean
  skills: number[]
  stats: ArmoryStats | null
  equipment: ArmoryDemonGear[]
}

export type ArmoryDemonsPayload = {
  name: string
  /** Demons currently in this character's COMP. */
  comp: ArmoryDemon[]
  /**
   * Demons in account-shared demon storage (Character unset on DemonBox).
   * Login username is never included.
   */
  accountStorage: ArmoryDemon[]
}

function decodeU32Array(
  blob: Uint8Array | Buffer | null | undefined,
  count: number
): number[] {
  if (!blob) return []
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  const out: number[] = []
  const n = Math.min(count, Math.floor(buf.length / 4))
  for (let i = 0; i < n; i++) {
    const v = buf.readUInt32LE(i * 4)
    if (v !== 0) out.push(v)
  }
  return out
}

function decodeUuidSlotBlob(
  blob: Uint8Array | Buffer | null | undefined,
  slotCount: number
): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: slotCount }, () => null)
  if (!blob) return out
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  const n = Math.min(slotCount, Math.floor(buf.length / 16))
  for (let i = 0; i < n; i++) {
    out[i] = uuidBytesToString(buf.subarray(i * 16, i * 16 + 16))
  }
  return out
}

type DemonRow = {
  UID: string
  Type: number
  BoxSlot: number
  Familiarity: number
  GrowthType: number
  MitamaRank: number
  MitamaType: number
  MagReduction: number
  SoulPoints: number
  Locked: number
  LearnedSkills: Uint8Array | Buffer | null
  EquippedItems: Uint8Array | Buffer | null
  Reunion: Uint8Array | Buffer | null
  MitamaReunion: Uint8Array | Buffer | null
  ForceValues: Uint8Array | Buffer | null
  ForceStack: Uint8Array | Buffer | null
  Level: number | null
  XP: number | null
  HP: number | null
  MP: number | null
  MaxHP: number | null
  MaxMP: number | null
  STR: number | null
  MAGIC: number | null
  VIT: number | null
  INTEL: number | null
  SPEED: number | null
  LUCK: number | null
  CLSR: number | null
  LNGR: number | null
  SPELL: number | null
  SUPPORT: number | null
  PDEF: number | null
  MDEF: number | null
}

type ItemEnchantRow = {
  UID: string
  Type: number
  Tarot: number
  Soul: number
  BasicEffect: number
  SpecialEffect: number
  ModSlots: Uint8Array | Buffer | null
}

function demonDisplayName(type: number): string {
  return getDevilName(type)
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

function decodeS32Array(
  blob: Uint8Array | Buffer | null | undefined,
  count: number
): number[] {
  const out = Array.from({ length: count }, () => 0)
  if (!blob) return out
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  const n = Math.min(count, Math.floor(buf.length / 4))
  for (let i = 0; i < n; i++) out[i] = buf.readInt32LE(i * 4)
  return out
}

function decodeU16Array(
  blob: Uint8Array | Buffer | null | undefined,
  count: number
): number[] {
  const out = Array.from({ length: count }, () => 0)
  if (!blob) return out
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  const n = Math.min(count, Math.floor(buf.length / 2))
  for (let i = 0; i < n; i++) out[i] = buf.readUInt16LE(i * 2)
  return out
}

function reunionTotal(ranks: number[]): number {
  let total = 0
  for (const rank of ranks) {
    total += Math.min(Math.max(rank, 0), 8)
  }
  return total
}

function loadItemEnchants(uids: string[]): Map<string, ItemEnchantRow> {
  const map = new Map<string, ItemEnchantRow>()
  if (!uids.length) return map
  const db = getWorldDb()
  const placeholders = uids.map(() => "?").join(",")
  const items = db
    .prepare(
      `SELECT UID, Type, Tarot, Soul, BasicEffect, SpecialEffect, ModSlots
       FROM Item WHERE UID IN (${placeholders})`
    )
    .all(...uids) as ItemEnchantRow[]
  for (const it of items) map.set(it.UID, it)
  return map
}

function equipmentFromSlots(
  slots: (string | null)[],
  items: Map<string, ItemEnchantRow>
): ArmoryDemonGear[] {
  return slots.map((uid, i) => {
    const row = uid != null ? items.get(uid) : undefined
    const itemType = row?.Type ?? null
    const wiki = itemType != null ? getWikiItem(itemType) : undefined
    return {
      slot: i,
      label: DEMON_EQUIP_LABELS[i] ?? `Equip ${i + 1}`,
      itemType,
      name: wiki?.name ?? (itemType != null ? `Item ${itemType}` : null),
      tarot: row?.Tarot ?? 0,
      soul: row?.Soul ?? 0,
      basicEffect: row?.BasicEffect ?? 0,
      specialEffect: row?.SpecialEffect ?? 0,
      modSlots: decodeU16Array(row?.ModSlots ?? null, 5).filter((v) => v !== 0),
    }
  })
}

function statsFromRow(row: DemonRow): ArmoryStats | null {
  if (row.Level == null) return null
  return {
    level: row.Level,
    xp: Number(row.XP ?? 0),
    hp: row.HP ?? 0,
    mp: row.MP ?? 0,
    maxHp: row.MaxHP ?? 0,
    maxMp: row.MaxMP ?? 0,
    str: row.STR ?? 0,
    magic: row.MAGIC ?? 0,
    vit: row.VIT ?? 0,
    intel: row.INTEL ?? 0,
    speed: row.SPEED ?? 0,
    luck: row.LUCK ?? 0,
    clsr: row.CLSR ?? 0,
    lngr: row.LNGR ?? 0,
    spell: row.SPELL ?? 0,
    support: row.SUPPORT ?? 0,
    pdef: row.PDEF ?? 0,
    mdef: row.MDEF ?? 0,
  }
}

function loadInheritedSkills(
  demonUid: string
): { skillId: number; progress: number }[] {
  const db = getWorldDb()
  const rows = db
    .prepare(
      `SELECT Skill, Progress FROM InheritedSkill WHERE Demon = ? ORDER BY Skill ASC`
    )
    .all(demonUid) as { Skill: number; Progress: number }[]
  return rows.map((r) => ({ skillId: r.Skill, progress: r.Progress }))
}

function mapDemonRows(
  rows: DemonRow[],
  activeDemon: string | null
): ArmoryDemon[] {
  const itemUids = new Set<string>()
  const decodedEquip = new Map<string, (string | null)[]>()
  for (const row of rows) {
    const slots = decodeUuidSlotBlob(row.EquippedItems, DEMON_EQUIP_SLOTS)
    decodedEquip.set(row.UID, slots)
    for (const u of slots) if (u) itemUids.add(u)
  }

  const items = loadItemEnchants([...itemUids])

  return rows.map((row) => {
    const slots = decodedEquip.get(row.UID) ?? [null, null, null, null]
    const equipment = equipmentFromSlots(slots, items)
    return {
      id: row.UID,
      type: row.Type,
      name: demonDisplayName(row.Type),
      boxSlot: row.BoxSlot,
      familiarity: row.Familiarity,
      growthType: row.GrowthType,
      mitamaRank: row.MitamaRank,
      locked: Boolean(row.Locked),
      active: activeDemon != null && row.UID === activeDemon,
      skills: decodeU32Array(row.LearnedSkills, 8),
      stats: statsFromRow(row),
      equipment,
    }
  })
}

export function isValidDemonId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id
  )
}

function loadDemonsInBox(
  boxUid: string,
  activeDemon: string | null
): ArmoryDemon[] {
  const db = getWorldDb()
  const rows = db
    .prepare(
      `SELECT d.UID, d.Type, d.BoxSlot, d.Familiarity, d.GrowthType,
              d.MitamaRank, d.MitamaType, d.MagReduction, d.SoulPoints,
              d.Locked, d.LearnedSkills, d.EquippedItems,
              d.Reunion, d.MitamaReunion, d.ForceValues, d.ForceStack,
              e.Level, e.XP, e.HP, e.MP, e.MaxHP, e.MaxMP,
              e.STR, e.MAGIC, e.VIT, e.INTEL, e.SPEED, e.LUCK,
              e.CLSR, e.LNGR, e.SPELL, e.SUPPORT, e.PDEF, e.MDEF
       FROM Demon d
       LEFT JOIN EntityStats e ON e.UID = d.CoreStats
       WHERE d.DemonBox = ?
       ORDER BY d.BoxSlot ASC`
    )
    .all(boxUid) as DemonRow[]
  return mapDemonRows(rows, activeDemon)
}

/**
 * Public COMP + account demon-storage for a character name.
 * Never returns Account UID or login username.
 */
export function loadArmoryDemons(rawName: string): ArmoryDemonsPayload | null {
  const name = rawName.trim()
  if (!isValidCharacterName(name)) return null

  const db = getWorldDb()
  const char = db
    .prepare(
      `SELECT UID, Name, Account, COMP, ActiveDemon FROM Character WHERE Name = ?`
    )
    .get(name) as
    | {
        UID: string
        Name: string
        Account: string
        COMP: string
        ActiveDemon: string
      }
    | undefined

  if (!char) return null

  const active =
    char.ActiveDemon && char.ActiveDemon !== NULL_UUID
      ? char.ActiveDemon
      : null

  const comp =
    char.COMP && char.COMP !== NULL_UUID
      ? loadDemonsInBox(char.COMP, active)
      : []

  const storageBoxes = db
    .prepare(
      `SELECT UID FROM DemonBox
       WHERE Account = ?
         AND (Character IS NULL OR Character = ?)
         AND UID != ?
       ORDER BY BoxID ASC`
    )
    .all(char.Account, NULL_UUID, char.COMP || NULL_UUID) as { UID: string }[]

  const accountStorage: ArmoryDemon[] = []
  for (const box of storageBoxes) {
    accountStorage.push(...loadDemonsInBox(box.UID, null))
  }

  return {
    name: char.Name,
    comp,
    accountStorage,
  }
}

/** Single demon profile by UUID (public). Never includes account login. */
export function loadArmoryDemonDetail(
  rawId: string
): ArmoryDemonDetail | null {
  const id = rawId.trim().toLowerCase()
  if (!isValidDemonId(id)) return null

  const db = getWorldDb()
  const row = db
    .prepare(
      `SELECT d.UID, d.Type, d.BoxSlot, d.Familiarity, d.GrowthType,
              d.MitamaRank, d.MitamaType, d.MagReduction, d.SoulPoints,
              d.Locked, d.LearnedSkills, d.EquippedItems,
              d.Reunion, d.MitamaReunion, d.ForceValues, d.ForceStack,
              d.DemonBox,
              e.Level, e.XP, e.HP, e.MP, e.MaxHP, e.MaxMP,
              e.STR, e.MAGIC, e.VIT, e.INTEL, e.SPEED, e.LUCK,
              e.CLSR, e.LNGR, e.SPELL, e.SUPPORT, e.PDEF, e.MDEF
       FROM Demon d
       LEFT JOIN EntityStats e ON e.UID = d.CoreStats
       WHERE lower(d.UID) = ?`
    )
    .get(id) as (DemonRow & { DemonBox: string }) | undefined

  if (!row) return null

  const box = db
    .prepare(`SELECT Character FROM DemonBox WHERE UID = ?`)
    .get(row.DemonBox) as { Character: string } | undefined

  let ownerCharacter: string | null = null
  let location: ArmoryDemonDetail["location"] = "unknown"
  let active = false

  if (box?.Character && box.Character !== NULL_UUID) {
    const char = db
      .prepare(`SELECT Name, ActiveDemon FROM Character WHERE UID = ?`)
      .get(box.Character) as
      | { Name: string; ActiveDemon: string }
      | undefined
    if (char) {
      ownerCharacter = char.Name
      location = "comp"
      active =
        char.ActiveDemon != null &&
        char.ActiveDemon !== NULL_UUID &&
        char.ActiveDemon.toLowerCase() === row.UID.toLowerCase()
    }
  } else if (box) {
    location = "account_storage"
  }

  const slots = decodeUuidSlotBlob(row.EquippedItems, DEMON_EQUIP_SLOTS)
  const items = loadItemEnchants(
    slots.filter((u): u is string => u != null)
  )
  const reunion = decodeS8Array(row.Reunion, 12)

  return {
    id: row.UID,
    type: row.Type,
    name: demonDisplayName(row.Type),
    boxSlot: row.BoxSlot,
    familiarity: row.Familiarity,
    growthType: row.GrowthType,
    mitamaRank: row.MitamaRank,
    mitamaType: row.MitamaType,
    magReduction: row.MagReduction,
    soulPoints: row.SoulPoints,
    locked: Boolean(row.Locked),
    active,
    skills: decodeU32Array(row.LearnedSkills, 8),
    inheritedSkills: loadInheritedSkills(row.UID),
    stats: statsFromRow(row),
    equipment: equipmentFromSlots(slots, items),
    reunion,
    reunionTotal: reunionTotal(reunion),
    mitamaReunion: decodeU8Array(row.MitamaReunion, 96),
    forceValues: decodeS32Array(row.ForceValues, 20),
    forceStack: decodeU16Array(row.ForceStack, 8),
    ownerCharacter,
    location,
  }
}
