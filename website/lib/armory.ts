import { getWikiItem } from "@/content/wiki"
import {
  computeChainExpertisePoints,
  formatSkillId,
  getDevilName,
  getExpertiseIconSrc,
  getExpertiseMeta,
  getExpertiseName,
  listChainExpertiseIds,
  parseExpertiseProgress,
} from "@/lib/armory-catalogs"
import {
  decodeEquippedVA,
  resolveArmoryPortrait,
  type PortraitFingerprintInput,
} from "@/lib/armory-portrait"
import { enqueuePortraitJob } from "@/lib/portrait-queue"
import { getWorldDb, WorldDbMissingError } from "@/lib/world-db"

export { WorldDbMissingError }

/** MiItemBasicData.equipType indices used as EquippedItems array slots. */
export const EQUIP_SLOTS = [
  { index: 0, key: "head", label: "Head" },
  { index: 1, key: "face", label: "Face" },
  { index: 2, key: "neck", label: "Neck" },
  { index: 3, key: "top", label: "Top" },
  { index: 4, key: "arms", label: "Arms" },
  { index: 5, key: "bottom", label: "Bottom" },
  { index: 6, key: "feet", label: "Feet" },
  { index: 7, key: "comp", label: "COMP" },
  { index: 8, key: "ring", label: "Ring" },
  { index: 9, key: "earring", label: "Earring" },
  { index: 10, key: "extra", label: "Extra" },
  { index: 11, key: "back", label: "Back" },
  { index: 12, key: "talisman", label: "Talisman" },
  { index: 13, key: "weapon", label: "Weapon" },
  { index: 14, key: "bullets", label: "Bullets" },
] as const

export type EquipSlotKey = (typeof EQUIP_SLOTS)[number]["key"]

export type ArmoryEquipmentSlot = {
  slot: EquipSlotKey
  label: string
  index: number
  itemType: number | null
  name: string | null
  level: number | null
  iconSrc: string | null
  tarot: number
  soul: number
  basicEffect: number
  specialEffect: number
  modSlots: number[]
}

export type ArmoryAppearance = {
  gender: number
  skinType: number
  hairType: number
  faceType: number
  eyeType: number
  hairColor: number
  leftEyeColor: number
  rightEyeColor: number
}

export type ArmoryStats = {
  level: number
  xp: number
  hp: number
  mp: number
  maxHp: number
  maxMp: number
  str: number
  magic: number
  vit: number
  intel: number
  speed: number
  luck: number
  clsr: number
  lngr: number
  spell: number
  support: number
  pdef: number
  mdef: number
}

export type ArmoryClan = {
  name: string
  level: number
}

export type ArmoryExpertise = {
  id: number
  name: string
  /** Raw DB points (100× client display points). */
  points: number
  /** Client-style points (DB / 100). */
  displayPoints: number
  classLevel: number
  rank: number
  maxClass: number
  maxRank: number
  /** 0–1 progress within the current class (or final partial class). */
  classProgress: number
  /** 0–1 progress toward expertise max. */
  overallProgress: number
  atMax: boolean
  isChain: boolean
  /** False when ExpertClassData maxClass is 0 (never fully shipped). */
  implemented: boolean
  iconSrc: string | null
  disabled: boolean
}

export type ArmoryActiveDemon = {
  id: string
  type: number
  name: string
  level: number | null
}

/** Public armory profile — never includes Account / friends / bags. */
export type ArmoryProfile = {
  name: string
  lnc: number
  title: number
  appearance: ArmoryAppearance
  stats: ArmoryStats | null
  clan: ArmoryClan | null
  equipment: ArmoryEquipmentSlot[]
  expertises: ArmoryExpertise[]
  activeDemon: ArmoryActiveDemon | null
  /** Public URL for a captured portrait, or null until the worker/cache has one. */
  portraitUrl: string | null
  /** Content hash of appearance + VA + weapon + partner; cache key for PNG. */
  portraitFingerprint: string
  portraitStatus: "ready" | "queued" | "missing"
}

const NULL_UUID = "00000000-0000-0000-0000-000000000000"

export function uuidBytesToString(bytes: Uint8Array): string | null {
  if (bytes.length !== 16) return null
  if (bytes.every((b) => b === 0)) return null
  const h = Buffer.from(bytes).toString("hex")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Decode Character.EquippedItems BLOB (15 × 16-byte UUIDs). */
export function decodeEquippedItemUids(
  blob: Uint8Array | Buffer | null | undefined
): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: 15 }, () => null)
  if (!blob || blob.length < 240) return out
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  for (let i = 0; i < 15; i++) {
    out[i] = uuidBytesToString(buf.subarray(i * 16, i * 16 + 16))
  }
  return out
}

export function isValidCharacterName(name: string): boolean {
  if (name.length < 1 || name.length > 32) return false
  return /^[\p{L}\p{N}_' -]+$/u.test(name)
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

type CharacterRow = {
  UID: string
  Name: string
  Gender: number
  SkinType: number
  HairType: number
  FaceType: number
  EyeType: number
  HairColor: number
  LeftEyeColor: number
  RightEyeColor: number
  LNC: number
  CurrentTitle: number
  Clan: string
  ActiveDemon: string
  EquippedItems: Uint8Array | Buffer | null
  EquippedVA: Uint8Array | Buffer | null
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

type ItemRow = {
  UID: string
  Type: number
  Tarot: number
  Soul: number
  BasicEffect: number
  SpecialEffect: number
  ModSlots: Uint8Array | Buffer | null
}

function statsFromRow(row: CharacterRow): ArmoryStats | null {
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

/**
 * Exact-name public profile from world DB.
 * Returns null when the character does not exist.
 */
export function loadArmoryProfile(rawName: string): ArmoryProfile | null {
  const name = rawName.trim()
  if (!isValidCharacterName(name)) return null

  const db = getWorldDb()
  const row = db
    .prepare(
      `SELECT
         c.UID, c.Name, c.Gender, c.SkinType, c.HairType, c.FaceType, c.EyeType,
         c.HairColor, c.LeftEyeColor, c.RightEyeColor, c.LNC, c.CurrentTitle,
         c.Clan, c.ActiveDemon, c.EquippedItems, c.EquippedVA,
         e.Level, e.XP, e.HP, e.MP, e.MaxHP, e.MaxMP,
         e.STR, e.MAGIC, e.VIT, e.INTEL, e.SPEED, e.LUCK,
         e.CLSR, e.LNGR, e.SPELL, e.SUPPORT, e.PDEF, e.MDEF
       FROM Character c
       LEFT JOIN EntityStats e ON e.UID = c.CoreStats
       WHERE c.Name = ?`
    )
    .get(name) as CharacterRow | undefined

  if (!row) return null

  const equipUids = decodeEquippedItemUids(row.EquippedItems)
  const present = equipUids.filter((u): u is string => u != null)
  const items = new Map<string, ItemRow>()
  if (present.length) {
    const placeholders = present.map(() => "?").join(",")
    const rows = db
      .prepare(
        `SELECT UID, Type, Tarot, Soul, BasicEffect, SpecialEffect, ModSlots
         FROM Item WHERE UID IN (${placeholders})`
      )
      .all(...present) as ItemRow[]
    for (const it of rows) items.set(it.UID, it)
  }

  const equipment: ArmoryEquipmentSlot[] = EQUIP_SLOTS.map((slot) => {
    const uid = equipUids[slot.index]
    const it = uid != null ? items.get(uid) : undefined
    const itemType = it?.Type ?? null
    const wiki = itemType != null ? getWikiItem(itemType) : undefined
    return {
      slot: slot.key,
      label: slot.label,
      index: slot.index,
      itemType,
      name: wiki?.name ?? (itemType != null ? `Item ${itemType}` : null),
      level: wiki?.level ?? null,
      iconSrc: wiki?.iconSrc ?? null,
      tarot: it?.Tarot ?? 0,
      soul: it?.Soul ?? 0,
      basicEffect: it?.BasicEffect ?? 0,
      specialEffect: it?.SpecialEffect ?? 0,
      modSlots: decodeU16Array(it?.ModSlots ?? null, 5).filter((v) => v !== 0),
    }
  })

  let clan: ArmoryClan | null = null
  if (row.Clan && row.Clan !== NULL_UUID) {
    const clanRow = db
      .prepare(`SELECT Name, Level FROM Clan WHERE UID = ?`)
      .get(row.Clan) as { Name: string; Level: number } | undefined
    if (clanRow) {
      clan = { name: clanRow.Name, level: clanRow.Level }
    }
  }

  const expRows = db
    .prepare(
      `SELECT ExpertiseID, Points, Disabled FROM Expertise
       WHERE Character = ? ORDER BY ExpertiseID ASC`
    )
    .all(row.UID) as { ExpertiseID: number; Points: number; Disabled: number }[]

  const basePoints = new Map<number, number>()
  for (const e of expRows) {
    // Chains are derived — ignore any stray stored chain rows.
    if (getExpertiseMeta(e.ExpertiseID).isChain) continue
    basePoints.set(e.ExpertiseID, e.Points)
  }

  function toArmoryExpertise(
    id: number,
    points: number,
    disabled: boolean
  ): ArmoryExpertise {
    const meta = getExpertiseMeta(id)
    const prog = parseExpertiseProgress(points, meta.maxClass, meta.maxRank)
    return {
      id,
      name: getExpertiseName(id),
      points,
      displayPoints: prog.displayPoints,
      classLevel: prog.classLevel,
      rank: prog.rank,
      maxClass: prog.maxClass,
      maxRank: prog.maxRank,
      classProgress: prog.classProgress,
      overallProgress: prog.overallProgress,
      atMax: prog.atMax,
      isChain: Boolean(meta.isChain),
      implemented: meta.implemented !== false,
      iconSrc: getExpertiseIconSrc(id),
      disabled,
    }
  }

  const expertises: ArmoryExpertise[] = expRows
    .filter((e) => {
      if (getExpertiseMeta(e.ExpertiseID).isChain) return false
      return e.Points > 0 || e.Disabled
    })
    .map((e) => toArmoryExpertise(e.ExpertiseID, e.Points, Boolean(e.Disabled)))

  for (const chainId of listChainExpertiseIds()) {
    const meta = getExpertiseMeta(chainId)
    if (meta.implemented === false) continue
    const points = computeChainExpertisePoints(chainId, basePoints)
    if (points <= 0) continue
    expertises.push(toArmoryExpertise(chainId, points, false))
  }

  expertises.sort((a, b) => a.id - b.id)

  let activeDemon: ArmoryActiveDemon | null = null
  if (row.ActiveDemon && row.ActiveDemon !== NULL_UUID) {
    const d = db
      .prepare(
        `SELECT d.UID, d.Type, e.Level
         FROM Demon d
         LEFT JOIN EntityStats e ON e.UID = d.CoreStats
         WHERE d.UID = ?`
      )
      .get(row.ActiveDemon) as
      | { UID: string; Type: number; Level: number | null }
      | undefined
    if (d) {
      activeDemon = {
        id: d.UID,
        type: d.Type,
        name: getDevilName(d.Type),
        level: d.Level,
      }
    }
  }

  const appearance = {
    gender: row.Gender,
    skinType: row.SkinType,
    hairType: row.HairType,
    faceType: row.FaceType,
    eyeType: row.EyeType,
    hairColor: row.HairColor,
    leftEyeColor: row.LeftEyeColor,
    rightEyeColor: row.RightEyeColor,
  }
  const portraitInput: PortraitFingerprintInput = {
    appearance,
    title: row.CurrentTitle,
    equippedVA: decodeEquippedVA(row.EquippedVA),
    weaponType: equipment.find((s) => s.slot === "weapon")?.itemType ?? 0,
    demonType: activeDemon?.type ?? 0,
  }
  const portrait = resolveArmoryPortrait(portraitInput, row.Name)
  let portraitStatus: ArmoryProfile["portraitStatus"] = portrait.status
  if (portraitStatus === "missing") {
    try {
      enqueuePortraitJob(row.Name, portraitInput)
      portraitStatus = "queued"
    } catch (err) {
      console.error(
        `[armory] enqueue portrait failed for ${row.Name}:`,
        err instanceof Error ? err.message : err
      )
      portraitStatus = "missing"
    }
  }

  return {
    name: row.Name,
    lnc: row.LNC,
    title: row.CurrentTitle,
    appearance,
    stats: statsFromRow(row),
    clan,
    equipment,
    expertises,
    activeDemon,
    portraitUrl: portrait.url,
    portraitFingerprint: portrait.fingerprint,
    portraitStatus,
  }
}

export { formatSkillId, getDevilName }
