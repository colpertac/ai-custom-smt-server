/**
 * Offline port of the channel server's tokusei evaluation for the armory
 * estimate (comp_hack server/channel/src/TokuseiManager.cpp).
 *
 * Data: content/armory/tokusei-effects.json (scripts/wiki-export-armory-stats.sh),
 * one entry per tokusei with target, conditions, skill-condition flag,
 * CorrectValues, TokuseiCorrectValues (+ Attributes) and the combat aspects.
 */
import tokuseiEffectsPayload from "@/content/armory/tokusei-effects.json"

import { lncAlignment } from "@/lib/enchant-conditions"

export type TokuseiAttributes = {
  /** objects::TokuseiAttributes::MultiplierType_t name. */
  mult: string
  /** MultiplierValue (expertise id, divisor, HP_LTE percent…). */
  value?: number
  /** CORRECT_TABLE(_DIVIDE): CorrectTbl name the MultiplierValue indexes. */
  tbl?: string
  precision?: number
}

export type TokuseiConditionRow = {
  type: string
  value: number
  cmp?: "EQUALS" | "NOT_EQUAL" | "GTE" | "LTE"
  group?: number
}

export type TokuseiStatRow = {
  id: string
  type: number
  value: number
  attr?: TokuseiAttributes
}

export type TokuseiAspectRow = {
  type: string
  value: number
  attr?: TokuseiAttributes
}

export type TokuseiEffect = {
  target?: "SELF" | "PARTNER" | "SUMMONER" | "PARTY"
  /** Has SkillConditions / SkillTargetConditions (only during skill processing). */
  skill?: boolean
  conditions?: TokuseiConditionRow[]
  correct?: TokuseiStatRow[]
  tokuseiCorrect?: TokuseiStatRow[]
  aspects?: TokuseiAspectRow[]
}

const effects = (
  tokuseiEffectsPayload as unknown as { tokusei: Record<string, TokuseiEffect> }
).tokusei

export function getTokuseiEffect(tokuseiId: number): TokuseiEffect | undefined {
  return effects[String(tokuseiId)]
}

/** Character state the offline estimate knows about (all saved data). */
export type TokuseiCharacterContext = {
  level: number
  /** Raw LNC points. */
  lnc: number
  gender: number
  expertisePoints: ReadonlyMap<number, number>
  /** ItemData subCategory of the equipped weapon (EQUIPPED_WEAPON_TYPE). */
  weaponSubcategory: number | null
  digitalized: boolean
  /** floor(HP / MaxHP * 100) from the saved row. */
  hpPercent: number
  mpPercent: number
  /** PARTY-target tokusei only apply while in a party (solo when offline). */
  inParty: boolean
  /** Unique Demonic Compendium entries (DEMON_BOOK_DIVIDE). */
  compendiumCount: number
  /** Completed NORMAL/REPEATABLE quests (QUEST_BONUS_DIVIDE). */
  questBonusCount: number
}

const LNC_LAW = 0
const LNC_NEUTRAL = 2
const LNC_CHAOS = 4

function lncType(lncPoints: number): number {
  const align = lncAlignment(lncPoints)
  if (align === "LAW") return LNC_LAW
  if (align === "CHAOS") return LNC_CHAOS
  return LNC_NEUTRAL
}

/** ActiveEntityState::IsLNCType(lncType, invertFlag = false). */
export function isLncTypeLinear(lncPoints: number, value: number): boolean {
  const lnc = lncType(lncPoints)
  if (value === 1) return lnc === LNC_LAW || lnc === LNC_NEUTRAL
  if (value === 3) return lnc === LNC_NEUTRAL || lnc === LNC_CHAOS
  if (value === 5) return lnc === LNC_LAW || lnc === LNC_CHAOS
  return lnc === value
}

/** TokuseiManager::Compare. */
function compare(
  value1: number,
  value2: number,
  cmp: TokuseiConditionRow["cmp"],
  numericCompare: boolean
): boolean {
  switch (cmp ?? "EQUALS") {
    case "EQUALS":
      return value1 === value2
    case "NOT_EQUAL":
      return value1 !== value2
    case "LTE":
      return numericCompare && value1 <= value2
    case "GTE":
      return numericCompare && value1 >= value2
    default:
      return false
  }
}

function expertiseRank(
  expertisePoints: ReadonlyMap<number, number>,
  expertiseId: number
): number {
  return Math.floor(Math.max(0, expertisePoints.get(expertiseId) ?? 0) / 10000)
}

/**
 * TokuseiManager::EvaluateTokuseiCondition for a character with no live
 * session: no summoned partner, no party, no status effects, no zone and no
 * server-timed (GAME_TIME / MOON_PHASE) toggles.
 */
export function evaluateTokuseiCondition(
  condition: TokuseiConditionRow,
  ctx: TokuseiCharacterContext
): boolean {
  const cmp = condition.cmp ?? "EQUALS"
  const numericCompare = cmp !== "EQUALS" && cmp !== "NOT_EQUAL"
  switch (condition.type) {
    case "CURRENT_HP":
      return compare(ctx.hpPercent, condition.value, cmp, true)
    case "CURRENT_MP":
      return compare(ctx.mpPercent, condition.value, cmp, true)
    case "DIGITALIZED":
      if (numericCompare) return false
      return ctx.digitalized === (cmp === "EQUALS")
    case "EQUIPPED_WEAPON_TYPE": {
      if (numericCompare) return false
      const equipped =
        ctx.weaponSubcategory != null &&
        ctx.weaponSubcategory === condition.value
      return equipped === (cmp === "EQUALS")
    }
    case "EXPERTISE": {
      // Two smallest digits are the expertise ID, the rest the rank.
      const expertiseId = condition.value % 100
      const rankCompare = (condition.value - expertiseId) / 100
      return compare(
        expertiseRank(ctx.expertisePoints, expertiseId),
        rankCompare,
        cmp,
        true
      )
    }
    case "LNC":
      if (numericCompare) return false
      return isLncTypeLinear(ctx.lnc, condition.value) === (cmp === "EQUALS")
    case "GENDER":
      return compare(ctx.gender, condition.value, cmp, false)
    case "STATUS_ACTIVE":
    case "PARTY_DEMON_TYPE":
      // No status effects / party offline: "exists" is false.
      if (numericCompare) return false
      return cmp !== "EQUALS"
    case "DIASPORA_MINIBOSS_COUNT":
      // Needs a zone.
      return false
    case "GAME_TIME":
    case "MOON_PHASE":
      // Toggled by the server clock; unknown offline.
      return false
    case "SKILL_STATE":
      return false
    default:
      // PARTNER_*: requires a summoned partner (unknown offline → none).
      return false
  }
}

/** TokuseiManager::EvaluateTokuseiConditions (AND + OptionGroupID OR groups). */
export function evaluateTokuseiConditions(
  effect: TokuseiEffect,
  ctx: TokuseiCharacterContext
): boolean {
  const conditions = effect.conditions ?? []
  if (conditions.length === 0) return true
  const groups = new Map<number, boolean>()
  for (const condition of conditions) {
    const group = condition.group ?? 0
    if (group !== 0) {
      if (groups.get(group)) continue
      groups.set(
        group,
        Boolean(groups.get(group)) || evaluateTokuseiCondition(condition, ctx)
      )
    } else if (!evaluateTokuseiCondition(condition, ctx)) {
      return false
    }
  }
  for (const passed of groups.values()) {
    if (!passed) return false
  }
  return true
}

/**
 * Whether a tokusei collected on the character lands in its default
 * CalculatedEntityState::EffectiveTokusei (TokuseiManager::Recalculate):
 * PARTNER goes to the demon, PARTY needs a party, skill-conditioned tokusei
 * are only "pending" for skill processing.
 */
export function isEffectiveOnCharacter(
  effect: TokuseiEffect,
  ctx: TokuseiCharacterContext
): boolean {
  const target = effect.target ?? "SELF"
  if (target === "PARTNER") return false
  if (target === "PARTY" && !ctx.inParty) return false
  if (effect.skill) return false
  return evaluateTokuseiConditions(effect, ctx)
}

/**
 * TokuseiManager::CalculateAttributeValue. `stat` reads the current
 * CorrectTbl value (CORRECT_TABLE multipliers); `base` is the core stat for
 * BASE_AND_LEVEL.
 */
export function calculateAttributeValue(
  value: number,
  base: number,
  attr: TokuseiAttributes | undefined,
  ctx: TokuseiCharacterContext,
  stat: (id: string) => number
): number {
  let result = value
  if (!attr) return result

  const precision = attr.precision ?? 0
  if (precision > 0) result = result / Math.pow(10, precision)

  const multValue = attr.value ?? 0
  switch (attr.mult) {
    case "LEVEL":
      return result * ctx.level
    case "BASE_AND_LEVEL":
      return result * ctx.level * base
    case "EXPERTISE": {
      const points = ctx.expertisePoints.get(multValue) ?? 0
      return result * Math.floor(Math.fround(points * Math.fround(0.0001)))
    }
    case "CORRECT_TABLE":
      return result * (attr.tbl ? stat(attr.tbl) : 0)
    case "CORRECT_TABLE_DIVIDE": {
      const v = attr.tbl ? stat(attr.tbl) : 0
      return v !== 0 ? result / v : 0
    }
    case "PARTY_SIZE":
      // Party members in the zone; none offline.
      return 0
    case "HP_LTE":
      return ctx.hpPercent <= precision
        ? Math.trunc(value * (multValue * 0.01))
        : value
    case "DEMON_BOOK_DIVIDE":
      return multValue !== 0
        ? result * Math.floor(ctx.compendiumCount / multValue)
        : 0
    case "QUEST_BONUS_DIVIDE":
      return multValue !== 0
        ? result * Math.floor(ctx.questBonusCount / multValue)
        : 0
    default:
      // DEMON_BOOK_FAMILY/RACE (summoned demon), MITAMA_* and NONE: not known
      // offline / zero in the server's default branch.
      return 0
  }
}

/** TokuseiAspectType values the combat strip reads (StudioHandler). */
export const COMBAT_ASPECT_TYPES = [
  "TECH_ATTACK_RATE",
  "TECH_ATTACK_POWER",
  "PURSUIT_RATE",
  "PURSUIT_POWER",
  "LIMIT_BREAK_MAX",
] as const

export type CombatAspectType = (typeof COMBAT_ASPECT_TYPES)[number]

/** TokuseiManager::GetAspectSum over the effective tokusei (one entry per source). */
export function sumTokuseiAspect(
  effectiveTokusei: readonly number[],
  type: string,
  ctx: TokuseiCharacterContext,
  stat: (id: string) => number
): number {
  let sum = 0
  for (const tokuseiId of effectiveTokusei) {
    for (const aspect of getTokuseiEffect(tokuseiId)?.aspects ?? []) {
      if (aspect.type !== type) continue
      sum += calculateAttributeValue(aspect.value, 0, aspect.attr, ctx, stat)
    }
  }
  return sum
}

/** SKILL_ADD aspect skill IDs granted by these tokusei. */
export function tokuseiSkillAdds(tokuseiIds: readonly number[]): number[] {
  const out: number[] = []
  for (const tokuseiId of tokuseiIds) {
    for (const aspect of getTokuseiEffect(tokuseiId)?.aspects ?? []) {
      if (aspect.type === "SKILL_ADD" && aspect.value > 0) out.push(aspect.value)
    }
  }
  return out
}
