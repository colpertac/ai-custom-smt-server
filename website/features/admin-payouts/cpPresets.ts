import type { PayoutListItem } from "@/lib/dungeon-payout-types"
import type { EconomyPreset } from "@/lib/cp-presets-store"
import {
  BUILTIN_PRESET_SCALE,
  GRINDY_CP_BY_PAYOUT_ID,
} from "@/lib/cp-preset-grindy-table"

export type { EconomyPreset }

function roundCp(n: number): number {
  return Math.max(0, Math.round(n))
}

function builtinSheetCp(item: PayoutListItem, preset: EconomyPreset): number | null {
  const scale = BUILTIN_PRESET_SCALE[preset.id]
  if (scale === undefined) return null
  const base = GRINDY_CP_BY_PAYOUT_ID[item.id]
  if (base === undefined) return null
  return roundCp(base * scale)
}

/** Resolve preset CP for one list row (difficulty + mode aware). */
export function presetCpForPayout(
  item: PayoutListItem,
  preset: EconomyPreset
): number {
  const sheetCp = builtinSheetCp(item, preset)
  if (sheetCp !== null) return sheetCp

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

/** Build id→cp map for every item under a preset. */
export function applyEconomyPreset(
  list: PayoutListItem[],
  preset: EconomyPreset
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of list) {
    out[item.id] = presetCpForPayout(item, preset)
  }
  return out
}
