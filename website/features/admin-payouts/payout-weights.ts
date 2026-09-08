import type { PayoutListItem } from "@/lib/dungeon-payout-types"
import type { EconomyPreset } from "@/lib/cp-presets-store"

function roundCp(n: number): number {
  return Math.max(0, Math.round(n))
}

/** Resolve family weight; missing key → 1. */
export function familyWeightOf(
  weights: Record<string, number>,
  family: string | undefined
): number {
  const key = family?.trim() || "Ungrouped"
  const w = weights[key]
  return w === undefined ? 1 : w
}

/**
 * Tier/mode base from a CP preset — intentionally ignores the built-in grindy
 * absolute table so weights fully control per-dungeon amp.
 */
export function presetTierBase(
  item: PayoutListItem,
  preset: EconomyPreset
): number {
  const mode = item.mode ?? "normal"
  const difficulty = item.difficulty ?? "bronze"

  if (mode === "diaspora") return preset.diaspora
  if (mode === "bearcat") {
    return roundCp(preset.bronze * preset.bearcatMult)
  }
  if (mode === "boss") {
    return roundCp(preset.gold * preset.bossMultOfGold)
  }
  if (mode === "other" || difficulty === "special") {
    return preset.special
  }

  if (difficulty === "silver") return preset.silver
  if (difficulty === "gold") return preset.gold
  return preset.bronze
}

/** cp = round(tierBase × familyWeight × payoutWeight) */
export function weightedCp(
  item: PayoutListItem,
  preset: EconomyPreset,
  familyWeight: number,
  payoutWeight: number
): number {
  const base = presetTierBase(item, preset)
  return roundCp(base * familyWeight * payoutWeight)
}

/** Build id→cp map using preset bases × family × per-payout weights. */
export function applyWeightedEconomy(
  list: PayoutListItem[],
  preset: EconomyPreset,
  familyWeights: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of list) {
    const fw = familyWeightOf(familyWeights, item.family)
    const pw = item.cpWeight ?? 1
    out[item.id] = weightedCp(item, preset, fw, pw)
  }
  return out
}
