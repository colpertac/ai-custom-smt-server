import modEffectsPayload from "@/content/armory/mod-effects.json"
import itemSubcategoriesPayload from "@/content/armory/item-subcategories.json"
import compendiumBonusesPayload from "@/content/armory/compendium-bonuses.json"
import devilbookShiftsPayload from "@/content/armory/devilbook-shifts.json"
import enchantSetsPayload from "@/content/armory/enchant-sets.json"
import equipmentSetsPayload from "@/content/armory/equipment-sets.json"
import passiveSkillsPayload from "@/content/armory/passive-skills.json"
import expertiseRankSkillsPayload from "@/content/armory/expertise-rank-skills.json"
import sitemTokuseiPayload from "@/content/armory/sitem-tokusei.json"
import tokuseiCorrectionsPayload from "@/content/armory/tokusei-corrections.json"
import {
  getWikiEnchant,
  getWikiItem,
  wikiBasicFeatures,
  wikiCharacteristics,
} from "@/content/wiki"
import {
  evaluateEnchantCondition,
  isStatThresholdCondition,
  statIdForConditionType,
  type EnchantCondition,
} from "@/lib/enchant-conditions"
import { EXPERTISE_POINTS_PER_RANK } from "@/lib/armory-catalogs"
import type { ArmoryEquipmentSlot } from "@/lib/armory-equipment"
import type { ArmoryStats } from "@/lib/armory"

export type StatAdjustment = { id: string; type: number; value: number }

export type { EnchantCondition }

export type ArmoryComputedStats = {
  /** Stored EntityStats row (unequipped). */
  base: ArmoryStats
  /** Gear, fusion, tokusei, and passive skill bonuses applied. */
  total: ArmoryStats
  /** total − base per displayed field. */
  bonus: Partial<ArmoryStats>
}

type StatMap = Map<string, number>

type SkillRow = {
  mainCategory: number
  correctTbl: StatAdjustment[]
}

const passiveSkills = (
  passiveSkillsPayload as {
    skills: Record<string, SkillRow>
  }
).skills

const expertiseRankSkills = (
  expertiseRankSkillsPayload as {
    expertises: Record<string, { rank: number; skills: number[] }[]>
  }
).expertises

const tokuseiCorrections = (
  tokuseiCorrectionsPayload as {
    tokusei: Record<string, StatAdjustment[]>
  }
).tokusei

const sitemTokusei = (
  sitemTokuseiPayload as { items: Record<string, number[]> }
).items

const equipmentSets = (
  equipmentSetsPayload as {
    sets: Record<string, { equipment: number[]; tokuseiIds: number[] }>
  }
).sets

const enchantSets = (
  enchantSetsPayload as {
    sets: Record<
      string,
      {
        effects: number[]
        tokuseiIds: number[]
        conditions?: EnchantCondition[]
      }
    >
  }
).sets

const MOD_SLOT_NULL_EFFECT = 0x00ff

const modEffects = (
  modEffectsPayload as {
    weapon: Record<string, number>
    armor: Record<string, Record<string, Record<string, number>>>
  }
)

const itemSubcategories = (
  itemSubcategoriesPayload as { items: Record<string, number> }
).items

const compendiumBonuses = (
  compendiumBonusesPayload as { summoner: Record<string, number[]> }
).summoner

const devilbookShifts = (
  devilbookShiftsPayload as {
    shifts: Record<string, { entryId: number; groupId: number }>
  }
).shifts

/** Valuable IDs from server constants (Devil Book v1/v2). */
const VALUABLE_DEVIL_BOOK_V1 = 250
const VALUABLE_DEVIL_BOOK_V2 = 251

/** Default non-Mitama digitalize stat rate (%). */
export const DEFAULT_DIGITALIZE_STAT_RATE = 30

const BASE_STAT_IDS = new Set([
  "STR",
  "MAGIC",
  "VIT",
  "INT",
  "SPEED",
  "LUCK",
])

const FORCE_NUMERIC = new Set([
  "RES_DEFAULT",
  "RES_WEAPON",
  "RES_SLASH",
  "RES_THRUST",
  "RES_STRIKE",
  "RES_LNGR",
  "RES_PIERCE",
  "RES_SPREAD",
  "RES_FIRE",
  "RES_ICE",
  "RES_ELEC",
  "RES_ALMIGHTY",
  "RES_FORCE",
  "RES_EXPEL",
  "RES_CURSE",
  "RES_HEAL",
  "RES_SUPPORT",
  "RES_MAGICFORCE",
  "RES_NERVE",
  "RES_MIND",
  "RES_WORD",
  "RES_SPECIAL",
  "RES_SUICIDE",
  "COOLDOWN_TIME",
  "CHANT_TIME",
])

const DISPLAY_STAT_IDS = [
  "STR",
  "MAGIC",
  "VIT",
  "INT",
  "SPEED",
  "LUCK",
  "CLSR",
  "LNGR",
  "SPELL",
  "SUPPORT",
  "PDEF",
  "MDEF",
  "HP_MAX",
  "MP_MAX",
] as const

const GROWTH_TABLE_SIZE = 16
const WEAPON_GROWTH: [number, number][] = [
  [2, 2], [4, 3], [6, 4], [8, 5], [10, 6], [12, 7], [14, 8], [16, 9],
  [18, 12], [21, 15], [24, 20], [27, 25], [30, 30], [35, 35], [40, 40], [50, 45],
]
const MINOR_GROWTH: [number, number][] = [
  [0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [5, 2],
  [10, 3], [15, 4], [20, 5], [25, 7], [30, 10], [35, 13], [40, 16], [50, 20],
]
const TOP_BOTTOM_GROWTH: [number, number][] = [
  [0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [0, 1], [5, 2],
  [10, 3], [15, 5], [20, 7], [25, 10], [30, 13], [35, 16], [40, 19], [50, 25],
]

function statMapFromBase(base: ArmoryStats): StatMap {
  const map: StatMap = new Map()
  for (const id of DISPLAY_STAT_IDS) map.set(id, 0)
  map.set("STR", base.str)
  map.set("MAGIC", base.magic)
  map.set("VIT", base.vit)
  map.set("INT", base.intel)
  map.set("SPEED", base.speed)
  map.set("LUCK", base.luck)
  map.set("HP_MAX", 70)
  map.set("MP_MAX", 10)
  map.set("HP_REGEN", 1)
  map.set("MP_REGEN", 1)
  return map
}

function fuseBoost(bonus: number, table: [number, number][]): number {
  if (bonus <= 0) return 0
  for (let k = 0; k < GROWTH_TABLE_SIZE; k++) {
    if (table[k]![0] === bonus) return table[k]![1]
    if (table[k]![0] > bonus) {
      return k > 0 ? table[k - 1]![1] : 1
    }
  }
  return table[GROWTH_TABLE_SIZE - 1]![1]
}

function fuseBonusTypes(equipType: string): [string | null, string | null, string | null] {
  switch (equipType) {
    case "EQUIP_TYPE_WEAPON":
      return ["CLSR", "SPELL", "SUPPORT"]
    case "EQUIP_TYPE_TOP":
    case "EQUIP_TYPE_BOTTOM":
      return ["PDEF", "MDEF", null]
    case "EQUIP_TYPE_HEAD":
    case "EQUIP_TYPE_ARMS":
    case "EQUIP_TYPE_FEET":
      return ["PDEF", "MDEF", null]
    case "EQUIP_TYPE_RING":
    case "EQUIP_TYPE_EARRING":
    case "EQUIP_TYPE_EXTRA":
    case "EQUIP_TYPE_TALISMAN":
      return [null, "MDEF", null]
    default:
      return [null, null, null]
  }
}

function fuseGrowthTable(equipType: string): [number, number][] {
  if (equipType === "EQUIP_TYPE_WEAPON") return WEAPON_GROWTH
  if (equipType === "EQUIP_TYPE_TOP" || equipType === "EQUIP_TYPE_BOTTOM") {
    return TOP_BOTTOM_GROWTH
  }
  return MINOR_GROWTH
}

function weaponClsrOrLngr(weaponType: string | null): string {
  if (weaponType === "CLOSE_RANGE") return "CLSR"
  return "LNGR"
}

export function decodeLearnedSkillIds(
  blob: Uint8Array | Buffer | null | undefined
): number[] {
  if (!blob) return []
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob)
  if (buf.length < 4) return []
  const count = buf.readUInt32LE(0)
  const ids: number[] = []
  for (let i = 4; i + 4 <= buf.length && ids.length < count; i += 4) {
    const id = buf.readUInt32LE(i)
    if (id > 0) ids.push(id)
  }
  return ids
}

export function computeDisabledExpertiseSkills(
  learnedSkills: readonly number[],
  expertisePoints: ReadonlyMap<number, number>
): Set<number> {
  const learned = new Set(learnedSkills)
  const disabled = new Set<number>()
  for (const [expIdStr, ranks] of Object.entries(expertiseRankSkills)) {
    const expId = Number(expIdStr)
    const points = expertisePoints.get(expId) ?? 0
    const currentRank = Math.floor(Math.max(0, points) / EXPERTISE_POINTS_PER_RANK)
    for (const entry of ranks) {
      if (entry.rank > currentRank) {
        for (const skillId of entry.skills) {
          if (learned.has(skillId)) disabled.add(skillId)
        }
      }
    }
  }
  return disabled
}

function addTokuseiAdjustments(out: StatAdjustment[], tokuseiId: number): void {
  for (const row of tokuseiCorrections[String(tokuseiId)] ?? []) {
    out.push(row)
  }
}

function addConditionTokusei(
  out: StatAdjustment[],
  deferred: EnchantCondition[],
  conditions: EnchantCondition[] | undefined,
  ctx: {
    level: number
    lnc: number
    expertisePoints: ReadonlyMap<number, number>
  }
): void {
  for (const condition of conditions ?? []) {
    if (isStatThresholdCondition(condition.type)) {
      deferred.push(condition)
      continue
    }
    if (!evaluateEnchantCondition(condition, ctx)) continue
    for (const tokId of condition.tokuseiIds) {
      addTokuseiAdjustments(out, tokId)
    }
  }
}

function collectEnchantEffectIds(equipment: ArmoryEquipmentSlot[]): Set<number> {
  const effects = new Set<number>()
  for (const slot of equipment) {
    if (slot.tarot > 0) effects.add(slot.tarot)
    if (slot.soul > 0) effects.add(slot.soul)
  }
  return effects
}

function collectEquipmentSetTokusei(equipment: ArmoryEquipmentSlot[]): number[] {
  const equipped = equipment.map((slot) => slot.itemType ?? 0)
  const tokuseiIds: number[] = []

  for (const set of Object.values(equipmentSets)) {
    const required = set.equipment
    if (!required.some((itemId) => itemId > 0)) continue

    let valid = true
    for (let slot = 0; slot < 15; slot++) {
      const req = required[slot] ?? 0
      if (req > 0 && equipped[slot] !== req) {
        valid = false
        break
      }
    }
    if (!valid) continue
    tokuseiIds.push(...set.tokuseiIds)
  }

  return tokuseiIds
}

function collectEnchantSetBonuses(effectIds: ReadonlySet<number>): {
  tokuseiIds: number[]
  conditions: EnchantCondition[]
} {
  const tokuseiIds: number[] = []
  const conditions: EnchantCondition[] = []

  for (const set of Object.values(enchantSets)) {
    if (!set.effects.every((effectId) => effectIds.has(effectId))) continue
    tokuseiIds.push(...set.tokuseiIds)
    conditions.push(...(set.conditions ?? []))
  }

  return { tokuseiIds, conditions }
}

function isUsableModEffect(effectId: number): boolean {
  return effectId !== 0 && effectId !== MOD_SLOT_NULL_EFFECT
}

function collectModSlotTokusei(equipment: ArmoryEquipmentSlot[]): number[] {
  const tokuseiIds: number[] = []
  for (const slot of equipment) {
    if (slot.itemType == null || slot.modSlots.length === 0) continue
    const isWeapon = slot.slot === "weapon"
    const groupId = itemSubcategories[String(slot.itemType)]
    for (const effectId of slot.modSlots) {
      if (!isUsableModEffect(effectId)) continue
      let tokuseiId = 0
      if (isWeapon) {
        tokuseiId = modEffects.weapon[String(effectId)] ?? 0
      } else if (groupId != null) {
        tokuseiId =
          modEffects.armor[String(groupId)]?.[String(slot.index)]?.[
            String(effectId)
          ] ?? 0
      }
      if (tokuseiId > 0) tokuseiIds.push(tokuseiId)
    }
  }
  return tokuseiIds
}

function hasValuable(valuables: Uint8Array | Buffer | null, id: number): boolean {
  if (!valuables || id < 0) return false
  const buf = Buffer.isBuffer(valuables) ? valuables : Buffer.from(valuables)
  const byteIndex = Math.floor(id / 8)
  const bit = id % 8
  if (byteIndex >= buf.length) return false
  return (buf[byteIndex]! & (1 << bit)) !== 0
}

/** Count distinct compendium entries from AccountWorldData.DevilBook blob. */
export function countCompendiumEntries(
  devilBook: Uint8Array | Buffer | null | undefined
): number {
  if (!devilBook) return 0
  const buf = Buffer.isBuffer(devilBook) ? devilBook : Buffer.from(devilBook)
  const shiftValues = new Set<number>()
  for (let i = 0; i < buf.length; i++) {
    const val = buf[i]!
    for (let k = 0; k < 8; k++) {
      if ((val & (1 << k)) !== 0) shiftValues.add(i * 8 + k)
    }
  }
  const entries = new Set<number>()
  for (const shift of shiftValues) {
    const row = devilbookShifts[String(shift)]
    if (row && row.groupId > 0) entries.add(row.entryId)
  }
  return entries.size
}

export function collectCompendiumTokusei(
  devilBook: Uint8Array | Buffer | null | undefined,
  valuables: Uint8Array | Buffer | null | undefined
): number[] {
  if (!hasValuable(valuables ?? null, VALUABLE_DEVIL_BOOK_V1)) return []
  if (!hasValuable(valuables ?? null, VALUABLE_DEVIL_BOOK_V2)) return []
  const count = countCompendiumEntries(devilBook ?? null)
  if (count <= 0) return []
  const tokuseiIds: number[] = []
  for (const [threshold, ids] of Object.entries(compendiumBonuses)) {
    if (count >= Number(threshold)) tokuseiIds.push(...ids)
  }
  return tokuseiIds
}

function applyDigitalizeToMap(
  stats: StatMap,
  demonStats: ArmoryStats,
  statRate: number
): void {
  const scale = statRate / 100
  const pairs: [string, number][] = [
    ["STR", demonStats.str],
    ["MAGIC", demonStats.magic],
    ["VIT", demonStats.vit],
    ["INT", demonStats.intel],
    ["SPEED", demonStats.speed],
    ["LUCK", demonStats.luck],
    ["CLSR", demonStats.clsr],
    ["LNGR", demonStats.lngr],
    ["SPELL", demonStats.spell],
    ["SUPPORT", demonStats.support],
    ["PDEF", demonStats.pdef],
    ["MDEF", demonStats.mdef],
    ["HP_MAX", demonStats.maxHp],
    ["MP_MAX", demonStats.maxMp],
  ]
  for (const [id, value] of pairs) {
    const bonus = Math.trunc(value * scale)
    if (bonus !== 0) stats.set(id, (stats.get(id) ?? 0) + bonus)
  }
}

function collectAdjustments(input: {
  equipment: ArmoryEquipmentSlot[]
  learnedSkills: readonly number[]
  disabledSkills: ReadonlySet<number>
  level: number
  lnc: number
  expertisePoints: ReadonlyMap<number, number>
  extraTokuseiIds?: readonly number[]
}): { adjustments: StatAdjustment[]; deferred: EnchantCondition[] } {
  const out: StatAdjustment[] = []
  const deferred: EnchantCondition[] = []
  const ctx = {
    level: input.level,
    lnc: input.lnc,
    expertisePoints: input.expertisePoints,
  }

  for (const tokId of input.extraTokuseiIds ?? []) {
    addTokuseiAdjustments(out, tokId)
  }

  for (const tokId of collectModSlotTokusei(input.equipment)) {
    addTokuseiAdjustments(out, tokId)
  }

  for (const slot of input.equipment) {
    if (slot.itemType == null) continue
    const basicId =
      slot.basicEffect > 0 && slot.basicEffect !== slot.itemType
        ? slot.basicEffect
        : slot.itemType
    const specialId =
      slot.specialEffect > 0 && slot.specialEffect !== slot.itemType
        ? slot.specialEffect
        : slot.itemType

    const basicItem = getWikiItem(basicId)
    if (basicItem) {
      for (const row of wikiBasicFeatures(basicItem)) {
        out.push({ id: row.id, type: row.type, value: row.value })
      }
      for (const row of wikiCharacteristics(basicItem)) {
        out.push({ id: row.id, type: row.type, value: row.value })
      }
    }

    for (const tokId of sitemTokusei[String(specialId)] ?? []) {
      addTokuseiAdjustments(out, tokId)
    }

    if (slot.tarot > 0) {
      const enchant = getWikiEnchant(slot.tarot)
      for (const tokId of enchant?.tarot.tokuseiIds ?? []) {
        addTokuseiAdjustments(out, tokId)
      }
      addConditionTokusei(out, deferred, enchant?.tarot.conditions, ctx)
    }
    if (slot.soul > 0) {
      const enchant = getWikiEnchant(slot.soul)
      for (const tokId of enchant?.soul.tokuseiIds ?? []) {
        addTokuseiAdjustments(out, tokId)
      }
      addConditionTokusei(out, deferred, enchant?.soul.conditions, ctx)
    }
  }

  for (const tokId of collectEquipmentSetTokusei(input.equipment)) {
    addTokuseiAdjustments(out, tokId)
  }

  const effectIds = collectEnchantEffectIds(input.equipment)
  const enchantSetBonuses = collectEnchantSetBonuses(effectIds)
  for (const tokId of enchantSetBonuses.tokuseiIds) {
    addTokuseiAdjustments(out, tokId)
  }
  addConditionTokusei(out, deferred, enchantSetBonuses.conditions, ctx)

  for (const skillId of input.learnedSkills) {
    if (input.disabledSkills.has(skillId)) continue
    const skill = passiveSkills[String(skillId)]
    if (!skill) continue
    // Passive (0) always applies; switch (2) applies when learned (active toggles are session-only).
    if (skill.mainCategory !== 0 && skill.mainCategory !== 2) continue
    for (const row of skill.correctTbl) {
      out.push(row)
    }
  }

  return { adjustments: out, deferred }
}

function deferredToAdjustments(
  deferred: EnchantCondition[],
  stats: StatMap
): StatAdjustment[] {
  const out: StatAdjustment[] = []
  for (const condition of deferred) {
    const statId = statIdForConditionType(condition.type)
    if (!statId) continue
    const stat = stats.get(statId) ?? 0
    if (stat < 0 || stat < (condition.params[0] ?? 0)) continue
    for (const tokId of condition.tokuseiIds) {
      addTokuseiAdjustments(out, tokId)
    }
  }
  return out
}

function normalizeAdjustment(row: StatAdjustment): StatAdjustment {
  let type = row.type
  if (type >= 100) type = type - 100
  if (type === 1 && FORCE_NUMERIC.has(row.id)) type = 0
  return { id: row.id, type, value: row.value }
}

function adjustStats(
  stats: StatMap,
  adjustments: StatAdjustment[],
  baseMode: boolean
): void {
  const numericSums: StatMap = new Map()
  const percentSums: [StatMap, StatMap] = [new Map(), new Map()]

  for (const raw of adjustments) {
    const row = normalizeAdjustment(raw)
    const isBase = BASE_STAT_IDS.has(row.id)
    if (baseMode !== isBase) continue

    if (row.type === 0) {
      numericSums.set(row.id, (numericSums.get(row.id) ?? 0) + row.value)
    } else if (row.type === 1 || row.type === 2) {
      if (row.value === 0) {
        stats.set(row.id, 0)
        numericSums.delete(row.id)
        percentSums[0].delete(row.id)
        percentSums[1].delete(row.id)
      } else {
        const idx = row.type - 1
        const layer = percentSums[idx]!
        layer.set(row.id, (layer.get(row.id) ?? 0) + row.value)
      }
    }
  }

  for (const id of DISPLAY_STAT_IDS) {
    for (let layer = 0; layer < 3; layer++) {
      if (layer === 1) {
        const add = numericSums.get(id)
        if (add != null) stats.set(id, (stats.get(id) ?? 0) + add)
      } else {
        const idx = layer === 0 ? 0 : 1
        const pct = percentSums[idx].get(id)
        if (pct != null) {
          const current = stats.get(id) ?? 0
          const sum = pct
          const adjusted =
            sum <= -100 ? 0 : Math.trunc(current + current * (sum * 0.01))
          stats.set(id, adjusted)
        }
      }
    }
  }
}

function calculateDependentStats(stats: StatMap, level: number): void {
  const str = stats.get("STR") ?? 0
  const magic = stats.get("MAGIC") ?? 0
  const vit = stats.get("VIT") ?? 0
  const intel = stats.get("INT") ?? 0
  const speed = stats.get("SPEED") ?? 0
  const hpMax = stats.get("HP_MAX") ?? 0
  const mpMax = stats.get("MP_MAX") ?? 0

  stats.set(
    "HP_MAX",
    Math.trunc(
      hpMax +
        Math.round(hpMax * 0.03 * level) +
        Math.round(str * 0.3) +
        Math.round((hpMax * 0.01 + 0.5) * vit)
    )
  )
  stats.set(
    "MP_MAX",
    Math.trunc(
      mpMax +
        Math.round(mpMax * 0.03 * level) +
        Math.round(magic * 0.3) +
        Math.round((mpMax * 0.01 + 0.5) * intel)
    )
  )

  stats.set(
    "CLSR",
    Math.trunc((stats.get("CLSR") ?? 0) + Math.floor(str * 0.5 + level * 0.1))
  )
  stats.set(
    "LNGR",
    Math.trunc((stats.get("LNGR") ?? 0) + Math.floor(speed * 0.5 + level * 0.1))
  )
  stats.set(
    "SPELL",
    Math.trunc((stats.get("SPELL") ?? 0) + Math.floor(magic * 0.5 + level * 0.1))
  )
  stats.set(
    "SUPPORT",
    Math.trunc((stats.get("SUPPORT") ?? 0) + Math.floor(intel * 0.5 + level * 0.1))
  )
  stats.set(
    "PDEF",
    Math.trunc((stats.get("PDEF") ?? 0) + Math.floor(vit * 0.1 + level * 0.1))
  )
  stats.set(
    "MDEF",
    Math.trunc((stats.get("MDEF") ?? 0) + Math.floor(intel * 0.1 + level * 0.1))
  )
}

function applyFuseBonuses(
  stats: StatMap,
  equipment: ArmoryEquipmentSlot[],
  fuseByItemUid: ReadonlyMap<string, number[]>
): void {
  for (const slot of equipment) {
    if (slot.itemType == null) continue
    const fuse = fuseByItemUid.get(slot.slot)
    if (!fuse) continue
    const item = getWikiItem(slot.itemType)
    if (!item) continue
    const types = fuseBonusTypes(item.equipType)
    const table = fuseGrowthTable(item.equipType)
    if (item.equipType === "EQUIP_TYPE_WEAPON") {
      types[0] = weaponClsrOrLngr(item.weaponType)
    }
    for (let i = 0; i < 3; i++) {
      const statId = types[i]
      const bonus = fuse[i] ?? 0
      if (!statId || bonus <= 0) continue
      const boost = fuseBoost(bonus, table)
      stats.set(statId, (stats.get(statId) ?? 0) + boost)
    }
  }
}

function statMapToArmoryStats(
  map: StatMap,
  hpMp: Pick<ArmoryStats, "hp" | "mp" | "level" | "xp">
): ArmoryStats {
  return {
    ...hpMp,
    maxHp: map.get("HP_MAX") ?? hpMp.hp,
    maxMp: map.get("MP_MAX") ?? hpMp.mp,
    str: map.get("STR") ?? 0,
    magic: map.get("MAGIC") ?? 0,
    vit: map.get("VIT") ?? 0,
    intel: map.get("INT") ?? 0,
    speed: map.get("SPEED") ?? 0,
    luck: map.get("LUCK") ?? 0,
    clsr: map.get("CLSR") ?? 0,
    lngr: map.get("LNGR") ?? 0,
    spell: map.get("SPELL") ?? 0,
    support: map.get("SUPPORT") ?? 0,
    pdef: map.get("PDEF") ?? 0,
    mdef: map.get("MDEF") ?? 0,
  }
}

function diffStats(total: ArmoryStats, base: ArmoryStats): Partial<ArmoryStats> {
  const bonus: Partial<ArmoryStats> = {}
  const keys: (keyof ArmoryStats)[] = [
    "maxHp", "maxMp", "str", "magic", "vit", "intel", "speed", "luck",
    "clsr", "lngr", "spell", "support", "pdef", "mdef",
  ]
  for (const key of keys) {
    const delta = total[key] - base[key]
    if (delta !== 0) bonus[key] = delta
  }
  return bonus
}

export function computeArmoryTotalStats(input: {
  base: ArmoryStats
  equipment: ArmoryEquipmentSlot[]
  learnedSkills: readonly number[]
  expertisePoints: ReadonlyMap<number, number>
  fuseBySlot: ReadonlyMap<string, number[]>
  lnc?: number
  /** Partner demon stats for offline digitalize estimate (not session-accurate). */
  digitalizeDemonStats?: ArmoryStats | null
  digitalizeStatRate?: number
  devilBook?: Uint8Array | Buffer | null
  valuables?: Uint8Array | Buffer | null
}): ArmoryComputedStats {
  const disabledSkills = computeDisabledExpertiseSkills(
    input.learnedSkills,
    input.expertisePoints
  )
  const compendiumTokusei = collectCompendiumTokusei(
    input.devilBook ?? null,
    input.valuables ?? null
  )
  const ctx = {
    level: input.base.level,
    lnc: input.lnc ?? 0,
    expertisePoints: input.expertisePoints,
  }
  const { adjustments, deferred } = collectAdjustments({
    equipment: input.equipment,
    learnedSkills: input.learnedSkills,
    disabledSkills,
    extraTokuseiIds: compendiumTokusei,
    ...ctx,
  })

  const working = statMapFromBase(input.base)
  if (input.digitalizeDemonStats) {
    applyDigitalizeToMap(
      working,
      input.digitalizeDemonStats,
      input.digitalizeStatRate ?? DEFAULT_DIGITALIZE_STAT_RATE
    )
  }
  adjustStats(working, adjustments, true)

  const statConditionalPass = deferredToAdjustments(deferred, working)
  if (statConditionalPass.length > 0) {
    adjustStats(working, statConditionalPass, true)
  }

  applyFuseBonuses(working, input.equipment, input.fuseBySlot)
  calculateDependentStats(working, input.base.level)
  adjustStats(working, [...adjustments, ...statConditionalPass], false)

  const total = statMapToArmoryStats(working, {
    level: input.base.level,
    xp: input.base.xp,
    hp: input.base.hp,
    mp: input.base.mp,
  })

  return {
    base: input.base,
    total,
    bonus: diffStats(total, input.base),
  }
}
