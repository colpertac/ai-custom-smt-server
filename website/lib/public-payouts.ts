import { listPayouts } from "@/lib/dungeon-payouts-fs"
import type { PayoutListItem } from "@/lib/dungeon-payout-types"
import type { PublicPayoutRow } from "@/lib/public-payout-types"

export type { PublicPayoutRow } from "@/lib/public-payout-types"
export { asPayoutListItems } from "@/lib/public-payout-types"

/** All dungeon payouts for the public CP sheet (including disabled stubs). */
export async function listPublicPayouts(): Promise<PublicPayoutRow[]> {
  const all = await listPayouts()
  return all.map(toPublicRow).sort((a, b) => a.id.localeCompare(b.id))
}

function toPublicRow(p: PayoutListItem): PublicPayoutRow {
  return {
    id: p.id,
    name: p.name,
    cp: p.cp,
    enabled: p.enabled,
    family: p.family,
    difficulty: p.difficulty,
    mode: p.mode,
    variantLabel: p.variantLabel,
  }
}
