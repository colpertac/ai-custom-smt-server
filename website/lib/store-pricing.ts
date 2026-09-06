import {
  getWikiItemCategory,
  wikiBasicFeatures,
  wikiCharacteristics,
} from "@/content/wiki/format"
import type {
  WikiItem,
  WikiItemCategory,
  WikiItemStat,
} from "@/content/wiki/types"

export type StorePriceFormula = {
  version: number
  minCp: number
  maxCp: number
  levelWeight: number
  categoryBase: Record<WikiItemCategory, number>
  /** Per-stat CP weight multiplied by the stat's raw value. */
  weights: Record<string, number>
  /** Optional hard block list (never sellable via web store). */
  denylistItemIds?: number[]
}

export type PriceTerm = {
  kind: "category" | "level" | "stat"
  id: string
  label: string
  value: number
  weight: number
  contribution: number
}

export type PriceBreakdown = {
  raw: number
  clamped: number
  terms: PriceTerm[]
  category: WikiItemCategory
}

export type PriceSource = "formula" | "override"

export type ResolvedStorePrice = {
  itemId: number
  cp: number
  source: PriceSource
  breakdown: PriceBreakdown | null
}

/** Sensible first-boot defaults — combat stats cost more CP. */
export const DEFAULT_STORE_PRICE_FORMULA: StorePriceFormula = {
  version: 1,
  minCp: 1,
  maxCp: 50_000,
  levelWeight: 0.5,
  categoryBase: {
    weapons: 25,
    armor: 15,
    items: 5,
  },
  weights: {
    CLSR: 0.8,
    LNGR: 0.8,
    SPELL: 0.8,
    SUPPORT: 0.4,
    CRITICAL: 1.2,
    LB_CHANCE: 2.5,
    LB_DAMAGE: 2.0,
    LIMIT_BREAK_MAX: 0.001,
    RATE_CLSR: 0.15,
    RATE_LNGR: 0.15,
    RATE_SPELL: 0.15,
    RATE_SUPPORT: 0.1,
    RATE_CLSR_TAKEN: 0.1,
    RATE_LNGR_TAKEN: 0.1,
    RATE_SPELL_TAKEN: 0.1,
    PDEF: 0.05,
    MDEF: 0.05,
    HP_MAX: 0.02,
    MP_MAX: 0.02,
    STR: 0.3,
    MAGIC: 0.3,
    VIT: 0.2,
    INT: 0.2,
    SPEED: 0.2,
    LUCK: 0.2,
    CRIT_DEF: 0.3,
    COOLDOWN_TIME: 0.05,
    RATE_XP: 0.2,
    BOOST_FIRE: 0.4,
    BOOST_ICE: 0.4,
    BOOST_ELEC: 0.4,
    BOOST_FORCE: 0.4,
    BOOST_LIGHT: 0.4,
    BOOST_DARK: 0.4,
    BOOST_ALMIGHTY: 0.5,
  },
}

/** Stat IDs pre-listed in the admin formula editor. */
export const KNOWN_STORE_STAT_IDS: string[] = Object.keys(
  DEFAULT_STORE_PRICE_FORMULA.weights
).sort()

export function normalizeStorePriceFormula(
  input: Partial<StorePriceFormula> | null | undefined
): StorePriceFormula {
  const base = DEFAULT_STORE_PRICE_FORMULA
  const categoryBase = {
    weapons:
      typeof input?.categoryBase?.weapons === "number"
        ? input.categoryBase.weapons
        : base.categoryBase.weapons,
    armor:
      typeof input?.categoryBase?.armor === "number"
        ? input.categoryBase.armor
        : base.categoryBase.armor,
    items:
      typeof input?.categoryBase?.items === "number"
        ? input.categoryBase.items
        : base.categoryBase.items,
  }
  const weights: Record<string, number> = { ...base.weights }
  if (input?.weights && typeof input.weights === "object") {
    for (const [key, value] of Object.entries(input.weights)) {
      if (!key.trim()) continue
      if (typeof value === "number" && Number.isFinite(value)) {
        weights[key.trim()] = value
      }
    }
  }
  const denylist = Array.isArray(input?.denylistItemIds)
    ? [
        ...new Set(
          input.denylistItemIds.filter(
            (n) => Number.isInteger(n) && n > 0
          ) as number[]
        ),
      ]
    : []

  const minCp =
    typeof input?.minCp === "number" && Number.isFinite(input.minCp)
      ? Math.max(0, Math.floor(input.minCp))
      : base.minCp
  let maxCp =
    typeof input?.maxCp === "number" && Number.isFinite(input.maxCp)
      ? Math.max(0, Math.floor(input.maxCp))
      : base.maxCp
  if (maxCp < minCp) maxCp = minCp

  return {
    version:
      typeof input?.version === "number" && Number.isInteger(input.version)
        ? Math.max(1, input.version)
        : base.version,
    minCp,
    maxCp,
    levelWeight:
      typeof input?.levelWeight === "number" &&
      Number.isFinite(input.levelWeight)
        ? input.levelWeight
        : base.levelWeight,
    categoryBase,
    weights,
    denylistItemIds: denylist.length > 0 ? denylist : undefined,
  }
}

function collectStats(item: WikiItem): WikiItemStat[] {
  return [...wikiBasicFeatures(item), ...wikiCharacteristics(item)]
}

/** Pure formula evaluation (no override). */
export function computeFormulaBreakdown(
  item: WikiItem,
  formula: StorePriceFormula
): PriceBreakdown {
  const category = getWikiItemCategory(item)
  const terms: PriceTerm[] = []

  const categoryBase = formula.categoryBase[category] ?? 0
  terms.push({
    kind: "category",
    id: category,
    label: `Category (${category})`,
    value: 1,
    weight: categoryBase,
    contribution: categoryBase,
  })

  const level = Math.max(0, item.level || 0)
  if (formula.levelWeight !== 0 && level > 0) {
    terms.push({
      kind: "level",
      id: "level",
      label: "Item level",
      value: level,
      weight: formula.levelWeight,
      contribution: level * formula.levelWeight,
    })
  }

  for (const stat of collectStats(item)) {
    const weight = formula.weights[stat.id]
    if (weight == null || weight === 0) continue
    const value = Number(stat.value) || 0
    if (value === 0) continue
    terms.push({
      kind: "stat",
      id: stat.id,
      label: stat.label || stat.id,
      value,
      weight,
      contribution: value * weight,
    })
  }

  const raw = terms.reduce((sum, t) => sum + t.contribution, 0)
  const rounded = Math.round(raw)
  const clamped = Math.min(formula.maxCp, Math.max(formula.minCp, rounded))

  return { raw, clamped, terms, category }
}

export function resolveStorePrice(
  item: WikiItem,
  formula: StorePriceFormula,
  overrideCp: number | null | undefined
): ResolvedStorePrice {
  if (
    typeof overrideCp === "number" &&
    Number.isFinite(overrideCp) &&
    overrideCp >= 0
  ) {
    return {
      itemId: item.id,
      cp: Math.floor(overrideCp),
      source: "override",
      breakdown: null,
    }
  }

  const breakdown = computeFormulaBreakdown(item, formula)
  return {
    itemId: item.id,
    cp: breakdown.clamped,
    source: "formula",
    breakdown,
  }
}

export function isItemDenylisted(
  itemId: number,
  formula: StorePriceFormula
): boolean {
  return Boolean(formula.denylistItemIds?.includes(itemId))
}
