/** Shared MiSpecialCondition evaluation for armory + gear planner. */

import { EXPERTISE_POINTS_PER_RANK } from "@/lib/armory-catalogs"

export type EnchantCondition = {
  type: number
  params: number[]
  tokuseiIds: number[]
}

export const STAT_CONDITION_STAT_IDS = [
  "STR",
  "MAGIC",
  "VIT",
  "INT",
  "SPEED",
  "LUCK",
] as const

export type StatConditionStatId = (typeof STAT_CONDITION_STAT_IDS)[number]

/** Planner LNC: 0 Law, 1 Neutral, 2 Chaos. */
export type PlannerLnc = 0 | 1 | 2

export type EnchantConditionCtx = {
  level: number
  /** Raw LNC points (armory character scale). */
  lnc: number
  expertisePoints?: ReadonlyMap<number, number>
  /** When set, type 10–15 thresholds are evaluated immediately. */
  stats?: Partial<Record<StatConditionStatId, number>>
}

export function lncPointsFromAlignment(align: PlannerLnc): number {
  if (align === 0) return -10000
  if (align === 2) return 10000
  return 0
}

export function lncAlignment(lnc: number): "LAW" | "NEUTRAL" | "CHAOS" {
  if (lnc >= 5000) return "CHAOS"
  if (lnc <= -5000) return "LAW"
  return "NEUTRAL"
}

export function isStatThresholdCondition(type: number): boolean {
  return type >= 10 && type <= 10 + STAT_CONDITION_STAT_IDS.length - 1
}

export function statIdForConditionType(type: number): StatConditionStatId | null {
  const idx = type - 10
  return STAT_CONDITION_STAT_IDS[idx] ?? null
}

/**
 * Evaluate a condition. Stat thresholds (10–15) require `ctx.stats`;
 * without stats they return false (caller may defer separately).
 * Expertise (100–158) uses `expertisePoints` (missing → 0 rank).
 */
export function evaluateEnchantCondition(
  condition: EnchantCondition,
  ctx: EnchantConditionCtx
): boolean {
  const [p1, p2] = condition.params
  switch (condition.type) {
    case 0:
      return true
    case 1:
      return (p1 === 0 || ctx.level >= p1) && (p2 === 0 || ctx.level <= p2)
    case 2: {
      const align = lncAlignment(ctx.lnc)
      if (align === "LAW") return (p1 & 0x04) !== 0
      if (align === "NEUTRAL") return (p1 & 0x02) !== 0
      if (align === "CHAOS") return (p1 & 0x01) !== 0
      return false
    }
    default:
      if (isStatThresholdCondition(condition.type)) {
        const statId = statIdForConditionType(condition.type)
        if (!statId || !ctx.stats) return false
        const stat = ctx.stats[statId] ?? 0
        return stat >= (p1 ?? 0)
      }
      if (condition.type >= 100 && condition.type <= 158) {
        const expId = condition.type - 100
        const points = ctx.expertisePoints?.get(expId) ?? 0
        const rank = Math.floor(
          Math.max(0, points) / EXPERTISE_POINTS_PER_RANK
        )
        return rank >= p1
      }
      return false
  }
}
