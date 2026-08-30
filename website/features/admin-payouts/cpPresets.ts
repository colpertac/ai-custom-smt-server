import type { PayoutListItem } from "@/lib/dungeon-payout-types"

export type EconomyPresetId = "grindy" | "normal" | "generous"

export type EconomyPreset = {
  id: EconomyPresetId
  label: string
  /** Short toolbar hint */
  blurb: string
  bronze: number
  silver: number
  gold: number
  /** Bearcat / DEMON_ONLY relative to bronze */
  bearcatMult: number
  diaspora: number
  /** Boss paths relative to gold */
  bossMultOfGold: number
  /** special / other (per-floor stubs, etc.) */
  special: number
}

/** Economy presets for bulk CP fill on the payout sheet. */
export const ECONOMY_PRESETS: Record<EconomyPresetId, EconomyPreset> = {
  grindy: {
    id: "grindy",
    label: "Grindy",
    blurb: "Typical PS grind — bronze ~5 CP",
    bronze: 5,
    silver: 12,
    gold: 25,
    bearcatMult: 1.5,
    diaspora: 120,
    bossMultOfGold: 1.2,
    special: 8,
  },
  normal: {
    id: "normal",
    label: "Normal",
    blurb: "Mid casual — bronze ~20 CP",
    bronze: 20,
    silver: 50,
    gold: 120,
    bearcatMult: 1.5,
    diaspora: 200,
    bossMultOfGold: 1.15,
    special: 25,
  },
  generous: {
    id: "generous",
    label: "Generous",
    blurb: "Casual — bronze ~50 CP",
    bronze: 50,
    silver: 120,
    gold: 250,
    bearcatMult: 1.5,
    diaspora: 400,
    bossMultOfGold: 1.2,
    special: 50,
  },
}

export const ECONOMY_PRESET_ORDER: EconomyPresetId[] = [
  "grindy",
  "normal",
  "generous",
]

function roundCp(n: number): number {
  return Math.max(0, Math.round(n))
}

/** Resolve preset CP for one list row (difficulty + mode aware). */
export function presetCpForPayout(
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

/** Build id→cp map for every item under a preset. */
export function applyEconomyPreset(
  list: PayoutListItem[],
  presetId: EconomyPresetId
): Record<string, number> {
  const preset = ECONOMY_PRESETS[presetId]
  const out: Record<string, number> = {}
  for (const item of list) {
    out[item.id] = presetCpForPayout(item, preset)
  }
  return out
}
