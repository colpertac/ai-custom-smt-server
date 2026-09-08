import type { PayoutListItem } from "@/lib/dungeon-payout-types"

/** Slim public row — no admin-only fields. */
export type PublicPayoutRow = {
  id: string
  name: string
  cp: number
  /** Magical Golden Apples from Golden Light (null if unmapped). */
  apples: number | null
  enabled: boolean
  family?: string
  difficulty?: string
  mode?: string
  variantLabel?: string
}

/** Adapt public rows so admin sheet grouping helpers can reuse them. */
export function asPayoutListItems(
  rows: PublicPayoutRow[]
): PayoutListItem[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    instanceId: 0,
    enabled: r.enabled,
    cp: r.cp,
    cpWeight: 1,
    family: r.family,
    difficulty: r.difficulty,
    mode: r.mode,
    variantLabel: r.variantLabel,
    crateDropCount: 0,
    clearItemCount: 0,
    filename: "",
  }))
}
