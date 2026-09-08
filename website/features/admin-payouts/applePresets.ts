import type { PayoutListItem } from "@/lib/dungeon-payout-types"
import { GRINDY_APPLES_BY_PAYOUT_ID } from "@/lib/apple-preset-grindy-table"
import { BUILTIN_PRESET_SCALE } from "@/lib/cp-preset-grindy-table"
import { familyWeightOf } from "@/features/admin-payouts/payout-weights"

function roundApples(n: number): number {
  return Math.max(0, Math.round(n))
}

/** Grindy baseline for a payout, if known. */
export function grindyApplesForPayout(payoutId: string): number | null {
  const base = GRINDY_APPLES_BY_PAYOUT_ID[payoutId]
  return base === undefined ? null : base
}

/**
 * Apply Grindy / Normal / Generous scale to known apple baselines.
 * Unknown payouts are omitted (sheet leaves them unchanged / —).
 */
export function applyApplePreset(
  list: PayoutListItem[],
  presetId: string
): Record<string, number> {
  const scale = BUILTIN_PRESET_SCALE[presetId]
  const out: Record<string, number> = {}
  if (scale === undefined) return out
  for (const item of list) {
    const base = GRINDY_APPLES_BY_PAYOUT_ID[item.id]
    if (base === undefined) continue
    out[item.id] = roundApples(base * scale)
  }
  return out
}

/** apples = round(grindyBase × familyWeight × payoutWeight) */
export function weightedApples(
  item: PayoutListItem,
  familyWeight: number,
  payoutWeight: number
): number | null {
  const base = GRINDY_APPLES_BY_PAYOUT_ID[item.id]
  if (base === undefined) return null
  return roundApples(base * familyWeight * payoutWeight)
}

/** Build id→apples map using grindy bases × family × per-payout weights. */
export function applyWeightedApples(
  list: PayoutListItem[],
  familyWeights: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const item of list) {
    const fw = familyWeightOf(familyWeights, item.family)
    const pw = item.cpWeight ?? 1
    const next = weightedApples(item, fw, pw)
    if (next != null) out[item.id] = next
  }
  return out
}

export const APPLE_PRESET_BUTTONS: {
  id: keyof typeof BUILTIN_PRESET_SCALE
  label: string
  blurb: string
}[] = [
  {
    id: "grindy",
    label: "Grindy",
    blurb: "Stock Golden Light amounts (NPC3401 baseline)",
  },
  {
    id: "normal",
    label: "Normal",
    blurb: "Grindy apple amounts × 5",
  },
  {
    id: "generous",
    label: "Generous",
    blurb: "Grindy apple amounts × 10",
  },
]
