import modEffectsPayload from "@/content/armory/mod-effects.json"
import itemSubcategoriesPayload from "@/content/armory/item-subcategories.json"
import compendiumBonusesPayload from "@/content/armory/compendium-bonuses.json"
import devilbookShiftsPayload from "@/content/armory/devilbook-shifts.json"
import enchantSetsPayload from "@/content/armory/enchant-sets.json"
import equipmentSetsPayload from "@/content/armory/equipment-sets.json"
import passiveSkillsPayload from "@/content/armory/passive-skills.json"
import expertiseRankSkillsPayload from "@/content/armory/expertise-rank-skills.json"
import sitemTokuseiPayload from "@/content/armory/sitem-tokusei.json"
import questBonusPayload from "@/content/armory/quest-bonus.json"
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
import type { ArmoryCombatBonuses, ArmoryStats } from "@/lib/armory"
import {
  calculateAttributeValue,
  getTokuseiEffect,
  isEffectiveOnCharacter,
  sumTokuseiAspect,
  tokuseiSkillAdds,
  type TokuseiAttributes,
  type TokuseiCharacterContext,
} from "@/lib/armory-tokusei"

export type StatAdjustment = { id: string; type: number; value: number }

/** A CorrectTbl row plus TokuseiCorrectTbl attributes (type ≥ 100). */
type Adjustment = StatAdjustment & { attr?: TokuseiAttributes }

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
  /** Charastic tokusei held while the passive/switch skill is learned. */
  tokuseiIds?: number[]
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

/**
 * CorrectTbl rows of the tokusei that are effective on the character
 * (TokuseiManager::Recalculate → ActiveEntityState::GetAdditionalCorrectTbls).
 * Target, skill conditions and tokusei conditions are evaluated in
 * lib/armory-tokusei.ts; one copy per source like the server's counts.
 */
function tokuseiAdjustments(effectiveTokusei: readonly number[]): Adjustment[] {
  const out: Adjustment[] = []
  for (const tokuseiId of effectiveTokusei) {
    const effect = getTokuseiEffect(tokuseiId)
    if (!effect) continue
    for (const row of effect.correct ?? []) {
      out.push({ id: row.id, type: row.type, value: row.value })
    }
    for (const row of effect.tokuseiCorrect ?? []) {
      out.push({ id: row.id, type: row.type, value: row.value, attr: row.attr })
    }
  }
  return out
}

function filterEffectiveTokusei(
  tokuseiIds: readonly number[],
  ctx: TokuseiCharacterContext
): number[] {
  const evaluated = new Map<number, boolean>()
  const out: number[] = []
  for (const tokuseiId of tokuseiIds) {
    let add = evaluated.get(tokuseiId)
    if (add == null) {
      const effect = getTokuseiEffect(tokuseiId)
      add = effect != null && isEffectiveOnCharacter(effect, ctx)
      evaluated.set(tokuseiId, add)
    }
    if (add) out.push(tokuseiId)
  }
  return out
}

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

/** ActiveEntityState.cpp FORCE_NUMERIC: type 1 (%) rows applied as numeric. */
const FORCE_NUMERIC = new Set([
  "RES_DEFAULT", "RES_WEAPON", "RES_SLASH", "RES_THRUST", "RES_STRIKE",
  "RES_LNGR", "RES_PIERCE", "RES_SPREAD", "RES_FIRE", "RES_ICE", "RES_ELEC",
  "RES_ALMIGHTY", "RES_FORCE", "RES_EXPEL", "RES_CURSE", "RES_HEAL",
  "RES_SUPPORT", "RES_MAGICFORCE", "RES_NERVE", "RES_MIND", "RES_WORD",
  "RES_SPECIAL", "RES_SUICIDE",
  "COOLDOWN_TIME",
  "RATE_XP", "RATE_MAG", "RATE_MACCA", "RATE_EXPERTISE", "RATE_CLSR",
  "RATE_LNGR", "RATE_SPELL", "RATE_SUPPORT", "RATE_HEAL", "RATE_CLSR_TAKEN",
  "RATE_LNGR_TAKEN", "RATE_SPELL_TAKEN", "RATE_SUPPORT_TAKEN",
  "RATE_HEAL_TAKEN",
  "BOOST_DEFAULT", "BOOST_WEAPON", "BOOST_SLASH", "BOOST_THRUST",
  "BOOST_STRIKE", "BOOST_LNGR", "BOOST_PIERCE", "BOOST_SPREAD", "BOOST_FIRE",
  "BOOST_ICE", "BOOST_ELEC", "BOOST_ALMIGHTY", "BOOST_FORCE", "BOOST_EXPEL",
  "BOOST_CURSE", "BOOST_HEAL", "BOOST_SUPPORT", "BOOST_MAGICFORCE",
  "BOOST_NERVE", "BOOST_MIND", "BOOST_WORD", "BOOST_SPECIAL", "BOOST_SUICIDE",
  "LB_CHANCE",
  "RATE_PC", "RATE_DEMON", "RATE_PC_TAKEN", "RATE_DEMON_TAKEN",
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

/** CorrectTbl values behind the armory "Combat bonuses" strip. */
const COMBAT_STAT_IDS = [
  "CRITICAL",
  "FINAL_CRIT_CHANCE",
  "LB_CHANCE",
  "LB_DAMAGE",
  "CHANT_TIME",
  "COOLDOWN_TIME",
] as const

/** Stats tracked through AdjustStats (CorrectTbl order irrelevant: no cross-reads). */
const TRACKED_STAT_IDS: readonly string[] = [
  ...DISPLAY_STAT_IDS,
  ...COMBAT_STAT_IDS,
]

/** CharacterManager::AdjustStatBounds minimums (tracked ids only). */
const STAT_MIN: Record<string, number> = {
  HP_MAX: 1,
  MP_MAX: 1,
  CLSR: 0,
  LNGR: 0,
  SPELL: 0,
  SUPPORT: 0,
  PDEF: 0,
  MDEF: 0,
  COOLDOWN_TIME: 5,
  CHANT_TIME: 0,
  STR: 0,
  MAGIC: 0,
  VIT: 0,
  INT: 0,
  SPEED: 0,
  LUCK: 0,
}

/** MAX_PLAYER_HP_MP (Constants.h.in) and the 999 core stat cap (players). */
const STAT_MAX: Record<string, number> = {
  HP_MAX: 30000,
  MP_MAX: 30000,
  STR: 999,
  MAGIC: 999,
  VIT: 999,
  INT: 999,
  SPEED: 999,
  LUCK: 999,
}

/** StudioHandler: lbCap = 30000 + floor(LIMIT_BREAK_MAX aspect sum). */
export const LB_CAP_BASE = 30000

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
  // CharacterManager::GetCharacterBaseStats
  map.set("CRITICAL", 0)
  map.set("FINAL_CRIT_CHANCE", 0)
  map.set("LB_CHANCE", 0)
  map.set("LB_DAMAGE", 100)
  map.set("CHANT_TIME", 100)
  map.set("COOLDOWN_TIME", 100)
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

function addConditionTokusei(
  out: number[],
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
      if (tokId > 0) out.push(tokId)
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

const questBonus = questBonusPayload as unknown as {
  questBonus: [number, number][]
  bonusQuestIds: number[]
}
const bonusQuestIds = new Set(questBonus.bonusQuestIds)

/**
 * CharacterState::UpdateQuestState: completed quests of type NORMAL or
 * REPEATABLE, read from the CharacterProgress.CompletedQuests bitmask.
 */
export function countQuestBonus(
  completedQuests: Uint8Array | Buffer | null | undefined
): number {
  if (!completedQuests) return 0
  let count = 0
  for (let index = 0; index < completedQuests.length; index++) {
    const block = completedQuests[index]!
    if (block === 0) continue
    for (let bit = 0; bit < 8; bit++) {
      if (block & (1 << bit) && bonusQuestIds.has(index * 8 + bit)) count++
    }
  }
  return count
}

/** QUEST_BONUS server constant: every tier the count has reached. */
export function questBonusTokusei(count: number): number[] {
  return questBonus.questBonus
    .filter(([threshold]) => threshold <= count)
    .map(([, tokuseiId]) => tokuseiId)
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

/** CharacterState::GetEquipmentStats: correctTbl rows (bullets ignore durability). */
function equipStatsActive(slot: ArmoryEquipmentSlot): boolean {
  if (slot.rentalExpired) return false
  return slot.durability !== 0 || slot.slot === "bullets"
}

/** CharacterState::RecalcEquipState: tokusei, enchants, mods, sets, fusion. */
function equipEffectsActive(slot: ArmoryEquipmentSlot): boolean {
  return !slot.rentalExpired && slot.durability !== 0
}

function collectAdjustments(input: {
  equipment: ArmoryEquipmentSlot[]
  learnedSkills: readonly number[]
  disabledSkills: ReadonlySet<number>
  level: number
  lnc: number
  expertisePoints: ReadonlyMap<number, number>
  extraTokuseiIds?: readonly number[]
  activeSwitchSkills: ReadonlySet<number>
}): {
  /** Item + skill CorrectTbl rows (always applied). */
  rows: Adjustment[]
  /** Direct tokusei (one entry per source), before target/condition checks. */
  tokuseiIds: number[]
  /** Passive/switch skills whose correctTbl already counted. */
  skillIds: Set<number>
  deferred: EnchantCondition[]
} {
  const rows: Adjustment[] = []
  const tokuseiIds: number[] = []
  const deferred: EnchantCondition[] = []
  const ctx = {
    level: input.level,
    lnc: input.lnc,
    expertisePoints: input.expertisePoints,
  }

  tokuseiIds.push(...(input.extraTokuseiIds ?? []))
  const effectEquipment = input.equipment.filter(equipEffectsActive)
  tokuseiIds.push(...collectModSlotTokusei(effectEquipment))

  for (const slot of input.equipment) {
    if (slot.itemType == null) continue
    const effectsActive = equipEffectsActive(slot)
    const basicId =
      slot.basicEffect > 0 && slot.basicEffect !== slot.itemType
        ? slot.basicEffect
        : slot.itemType
    const specialId =
      slot.specialEffect > 0 && slot.specialEffect !== slot.itemType
        ? slot.specialEffect
        : slot.itemType

    const basicItem = getWikiItem(basicId)
    if (basicItem && equipStatsActive(slot)) {
      for (const row of wikiBasicFeatures(basicItem)) {
        rows.push({ id: row.id, type: row.type, value: row.value })
      }
      for (const row of wikiCharacteristics(basicItem)) {
        rows.push({ id: row.id, type: row.type, value: row.value })
      }
    }

    if (!effectsActive) continue
    tokuseiIds.push(...(sitemTokusei[String(specialId)] ?? []))

    if (slot.tarot > 0) {
      const enchant = getWikiEnchant(slot.tarot)
      tokuseiIds.push(...(enchant?.tarot.tokuseiIds ?? []))
      addConditionTokusei(tokuseiIds, deferred, enchant?.tarot.conditions, ctx)
    }
    if (slot.soul > 0) {
      const enchant = getWikiEnchant(slot.soul)
      tokuseiIds.push(...(enchant?.soul.tokuseiIds ?? []))
      addConditionTokusei(tokuseiIds, deferred, enchant?.soul.conditions, ctx)
    }
  }

  tokuseiIds.push(...collectEquipmentSetTokusei(effectEquipment))

  const effectIds = collectEnchantEffectIds(effectEquipment)
  const enchantSetBonuses = collectEnchantSetBonuses(effectIds)
  tokuseiIds.push(...enchantSetBonuses.tokuseiIds)
  addConditionTokusei(tokuseiIds, deferred, enchantSetBonuses.conditions, ctx)

  // Learned passive/switch skills: correctTbl + charastic tokusei.
  const skillIds = new Set<number>()
  const skillTokusei: number[] = []
  for (const skillId of input.learnedSkills) {
    if (skillIds.has(skillId)) continue
    if (input.disabledSkills.has(skillId)) continue
    const skill = passiveSkills[String(skillId)]
    if (!skill) continue
    // Passive (0) always applies; switch (2) only while toggled on
    // (ApplySkillCorrectTbls, TokuseiManager.cpp:1117-1122).
    if (
      skill.mainCategory !== 0 &&
      !(skill.mainCategory === 2 && input.activeSwitchSkills.has(skillId))
    )
      continue
    skillIds.add(skillId)
    for (const row of skill.correctTbl) {
      rows.push(row)
    }
    skillTokusei.push(...(skill.tokuseiIds ?? []))
  }
  // Skills granted by SKILL_ADD aspects of the direct tokusei add their
  // charastic tokusei (TokuseiManager.cpp:1104-1130) but only when passive
  // or an *active* switch skill — granted switch toggles are assumed off
  // offline. Their correctTbl is added later from effective tokusei only.
  for (const skillId of tokuseiSkillAdds(tokuseiIds)) {
    if (skillIds.has(skillId)) continue
    const skill = passiveSkills[String(skillId)]
    if (!skill || skill.mainCategory !== 0) continue
    skillIds.add(skillId)
    skillTokusei.push(...(skill.tokuseiIds ?? []))
  }
  tokuseiIds.push(...skillTokusei)

  return { rows, tokuseiIds, skillIds, deferred }
}

function deferredToTokusei(
  deferred: EnchantCondition[],
  stats: StatMap
): number[] {
  const out: number[] = []
  for (const condition of deferred) {
    const statId = statIdForConditionType(condition.type)
    if (!statId) continue
    const stat = stats.get(statId) ?? 0
    if (stat < 0 || stat < (condition.params[0] ?? 0)) continue
    for (const tokId of condition.tokuseiIds) {
      if (tokId > 0) out.push(tokId)
    }
  }
  return out
}

type AdjustContext = {
  /** Unadjusted core stats (EntityStats) for BASE_AND_LEVEL multipliers. */
  base: ArmoryStats
  tokusei: TokuseiCharacterContext
}

const CORE_STAT_BASE: Record<string, keyof ArmoryStats> = {
  STR: "str",
  MAGIC: "magic",
  VIT: "vit",
  INT: "intel",
  SPEED: "speed",
  LUCK: "luck",
}

/**
 * Effective type/value for a row (ActiveEntityState::AdjustStats): type ≥ 100
 * is a TokuseiCorrectTbl whose value goes through CalculateAttributeValue and
 * whose 0% rows never zero the stat.
 */
function resolveAdjustment(
  row: Adjustment,
  stats: StatMap,
  ctx: AdjustContext
): { type: number; value: number; calc: boolean } {
  let type = row.type
  let value = row.value
  let calc = false
  if (type >= 100) {
    type = type - 100
    if (row.attr) {
      let base = 0
      if (row.attr.mult === "BASE_AND_LEVEL") {
        const key = CORE_STAT_BASE[row.id]
        base = key ? Number(ctx.base[key]) : 0
      }
      value = Math.trunc(
        calculateAttributeValue(value, base, row.attr, ctx.tokusei, (id) =>
          stats.get(id) ?? 0
        )
      )
    }
    calc = true
  }
  if (type === 1 && FORCE_NUMERIC.has(row.id)) type = 0
  return { type, value, calc }
}

function adjustStatBounds(stats: StatMap): void {
  for (const id of TRACKED_STAT_IDS) {
    let value = stats.get(id)
    if (value == null) continue
    if (value > 32767 && id !== "HP_MAX" && id !== "MP_MAX") value = 32767
    else if (value < -32768) value = -32768
    const min = STAT_MIN[id]
    if (min != null && value < min) value = min
    const max = STAT_MAX[id]
    if (max != null && value > max) value = max
    stats.set(id, value)
  }
}

/** ActiveEntityState::AdjustStats (+ CharacterManager::AdjustStatBounds). */
function adjustStats(
  stats: StatMap,
  adjustments: Adjustment[],
  baseMode: boolean,
  ctx: AdjustContext
): void {
  const numericSums: StatMap = new Map()
  const percentSums: [StatMap, StatMap] = [new Map(), new Map()]

  const resolved: { id: string; type: number; value: number; calc: boolean }[] =
    []
  for (const row of adjustments) {
    if (baseMode !== BASE_STAT_IDS.has(row.id)) continue
    resolved.push({ id: row.id, ...resolveAdjustment(row, stats, ctx) })
  }

  // Adjustments are sorted with "set to 0%" rows first; once removed, a stat
  // ignores every other row.
  const removed = new Set<string>()
  for (const row of resolved) {
    if ((row.type === 1 || row.type === 2) && row.value === 0 && !row.calc) {
      removed.add(row.id)
      stats.set(row.id, 0)
    }
  }

  for (const row of resolved) {
    if (removed.has(row.id)) continue
    if (row.type === 0) {
      numericSums.set(row.id, (numericSums.get(row.id) ?? 0) + row.value)
    } else if ((row.type === 1 || row.type === 2) && row.value !== 0) {
      const layer = percentSums[row.type - 1]!
      layer.set(row.id, (layer.get(row.id) ?? 0) + row.value)
    }
  }

  for (const id of TRACKED_STAT_IDS) {
    if (baseMode !== BASE_STAT_IDS.has(id)) continue
    // 1) % layer 1, 2) numeric, 3) % layer 2
    for (let layer = 0; layer < 3; layer++) {
      if (layer === 1) {
        const add = numericSums.get(id)
        if (add != null) stats.set(id, (stats.get(id) ?? 0) + add)
      } else {
        const pct = percentSums[layer === 0 ? 0 : 1].get(id)
        if (pct != null) {
          const current = stats.get(id) ?? 0
          const adjusted =
            pct <= -100 ? 0 : Math.trunc(current + Math.trunc(current * (pct * 0.01)))
          stats.set(id, adjusted)
        }
      }
    }
  }

  adjustStatBounds(stats)
}

/**
 * CharacterManager::CalculateDependentStats(mode 0x07) for a character:
 * HP/MP max, CLSR..MDEF, then incant/cooldown from INT/VIT/SPEED.
 */
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

  const chant = chantTimeFromStats(stats.get("CHANT_TIME") ?? 100, intel, speed)
  const cooldown = cooldownTimeFromStats(
    stats.get("COOLDOWN_TIME") ?? 100,
    vit,
    speed
  )
  stats.set("CHANT_TIME", chant)
  stats.set("COOLDOWN_TIME", cooldown)
}

/**
 * CalculateDependentStats mode 0x04: CHANT_TIME − floor(2.5·floor(INT/10) +
 * 1.5·floor(SPEED/10)), floored at 0.
 */
export function chantTimeFromStats(
  chantTime: number,
  intel: number,
  speed: number
): number {
  const adjust = Math.trunc(
    chantTime -
      Math.floor(2.5 * Math.floor(intel * 0.1) + 1.5 * Math.floor(speed * 0.1))
  )
  return adjust < 0 ? 0 : adjust
}

/**
 * CalculateDependentStats mode 0x04: COOLDOWN_TIME − floor(2.5·floor(VIT/10) +
 * 1.5·floor(SPEED/10)), floored at 5.
 */
export function cooldownTimeFromStats(
  cooldownTime: number,
  vit: number,
  speed: number
): number {
  const adjust = Math.trunc(
    cooldownTime -
      Math.floor(2.5 * Math.floor(vit * 0.1) + 1.5 * Math.floor(speed * 0.1))
  )
  return adjust < 5 ? 5 : adjust
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

export type ArmoryEstimateInput = {
  base: ArmoryStats
  equipment: ArmoryEquipmentSlot[]
  learnedSkills: readonly number[]
  expertisePoints: ReadonlyMap<number, number>
  fuseBySlot: ReadonlyMap<string, number[]>
  lnc?: number
  /** Character.Gender (GENDER tokusei conditions). */
  gender?: number
  /** Partner demon stats for offline digitalize estimate (not session-accurate). */
  digitalizeDemonStats?: ArmoryStats | null
  digitalizeStatRate?: number
  devilBook?: Uint8Array | Buffer | null
  valuables?: Uint8Array | Buffer | null
  /** CharacterProgress.CompletedQuests bitmask (quest bonus tokusei). */
  completedQuests?: Uint8Array | Buffer | null
  /** PARTY-target tokusei need a party; offline estimate assumes solo. */
  inParty?: boolean
  /** Additional direct tokusei (one entry per source), e.g. quest bonuses. */
  extraTokuseiIds?: readonly number[]
  /**
   * Switch skills toggled on. Session-only on the server (a fresh login starts
   * with none, AccountManager.cpp:182), so the offline estimate defaults to [].
   */
  activeSwitchSkills?: readonly number[]
}

export type ArmoryEstimate = {
  computedStats: ArmoryComputedStats
  combatBonuses: ArmoryCombatBonuses
}

function hpPercent(current: number, max: number): number {
  if (max <= 0) return 100
  return Math.floor((Math.fround(current) / Math.fround(max)) * 100)
}

function weaponSubcategory(equipment: ArmoryEquipmentSlot[]): number | null {
  const weapon = equipment.find((slot) => slot.slot === "weapon")
  if (weapon?.itemType == null) return null
  return itemSubcategories[String(weapon.itemType)] ?? null
}

/**
 * Offline port of CharacterState::RecalculateStats plus the StudioHandler
 * /armory/stats combat bonuses (CorrectTbl CRITICAL…COOLDOWN_TIME and the
 * TECH/PURSUIT/LIMIT_BREAK_MAX tokusei aspect sums).
 */
export function computeArmoryEstimate(input: ArmoryEstimateInput): ArmoryEstimate {
  const disabledSkills = computeDisabledExpertiseSkills(
    input.learnedSkills,
    input.expertisePoints
  )
  const compendiumTokusei = collectCompendiumTokusei(
    input.devilBook ?? null,
    input.valuables ?? null
  )
  const questBonusCount = countQuestBonus(input.completedQuests)
  const ctx = {
    level: input.base.level,
    lnc: input.lnc ?? 0,
    expertisePoints: input.expertisePoints,
  }
  const tokuseiCtx: TokuseiCharacterContext = {
    ...ctx,
    gender: input.gender ?? 2,
    weaponSubcategory: weaponSubcategory(input.equipment),
    digitalized: input.digitalizeDemonStats != null,
    hpPercent: hpPercent(input.base.hp, input.base.maxHp),
    mpPercent: hpPercent(input.base.mp, input.base.maxMp),
    inParty: input.inParty ?? false,
    compendiumCount: countCompendiumEntries(input.devilBook ?? null),
    questBonusCount,
  }
  const adjustCtx: AdjustContext = { base: input.base, tokusei: tokuseiCtx }

  const { rows, tokuseiIds, deferred } = collectAdjustments({
    equipment: input.equipment,
    learnedSkills: input.learnedSkills,
    disabledSkills,
    extraTokuseiIds: [
      ...compendiumTokusei,
      ...questBonusTokusei(questBonusCount),
      ...(input.extraTokuseiIds ?? []),
    ],
    activeSwitchSkills: new Set(input.activeSwitchSkills ?? []),
    ...ctx,
  })

  const effectiveTokusei = filterEffectiveTokusei(tokuseiIds, tokuseiCtx)
  // Tokusei-granted skills (GetAllSkills(includeTokusei)) add their correctTbl.
  const skillRows: Adjustment[] = []
  // ApplySkillCorrectTbls (ActiveEntityState.cpp:2719-2740): switch skills
  // only while toggled on, so tokusei-granted toggles are skipped offline.
  const learned = new Set(input.learnedSkills)
  const grantedWithRows = new Set<number>()
  for (const skillId of tokuseiSkillAdds(effectiveTokusei)) {
    if (learned.has(skillId) || grantedWithRows.has(skillId)) continue
    const skill = passiveSkills[String(skillId)]
    if (!skill || skill.mainCategory !== 0) continue
    grantedWithRows.add(skillId)
    skillRows.push(...skill.correctTbl)
  }
  const adjustments: Adjustment[] = [
    ...rows,
    ...skillRows,
    ...tokuseiAdjustments(effectiveTokusei),
  ]

  const working = statMapFromBase(input.base)
  if (input.digitalizeDemonStats) {
    applyDigitalizeToMap(
      working,
      input.digitalizeDemonStats,
      input.digitalizeStatRate ?? DEFAULT_DIGITALIZE_STAT_RATE
    )
  }
  adjustStats(working, adjustments, true, adjustCtx)

  const statConditional = filterEffectiveTokusei(
    deferredToTokusei(deferred, working),
    tokuseiCtx
  )
  const statConditionalPass = tokuseiAdjustments(statConditional)
  if (statConditionalPass.length > 0) {
    adjustStats(working, statConditionalPass, true, adjustCtx)
  }

  applyFuseBonuses(
    working,
    input.equipment.filter(equipEffectsActive),
    input.fuseBySlot
  )
  calculateDependentStats(working, input.base.level)
  adjustStats(working, [...adjustments, ...statConditionalPass], false, adjustCtx)

  const total = statMapToArmoryStats(working, {
    level: input.base.level,
    xp: input.base.xp,
    hp: input.base.hp,
    mp: input.base.mp,
  })

  const allEffective = [...effectiveTokusei, ...statConditional]
  const stat = (id: string) => working.get(id) ?? 0
  const aspect = (type: string) =>
    Math.floor(sumTokuseiAspect(allEffective, type, tokuseiCtx, stat))

  return {
    computedStats: {
      base: input.base,
      total,
      bonus: diffStats(total, input.base),
    },
    combatBonuses: {
      critical: stat("CRITICAL"),
      finalCritChance: stat("FINAL_CRIT_CHANCE"),
      lbChance: stat("LB_CHANCE"),
      lbDamage: stat("LB_DAMAGE"),
      lbCap: LB_CAP_BASE + aspect("LIMIT_BREAK_MAX"),
      techAttackRate: aspect("TECH_ATTACK_RATE"),
      techAttackPower: aspect("TECH_ATTACK_POWER"),
      pursuitRate: aspect("PURSUIT_RATE"),
      pursuitPower: aspect("PURSUIT_POWER"),
      incant: stat("CHANT_TIME"),
      cooldown: stat("COOLDOWN_TIME"),
    },
  }
}

export function computeArmoryTotalStats(
  input: ArmoryEstimateInput
): ArmoryComputedStats {
  return computeArmoryEstimate(input).computedStats
}
