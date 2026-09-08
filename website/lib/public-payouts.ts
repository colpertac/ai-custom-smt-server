import { listPayouts } from "@/lib/dungeon-payouts-fs"
import type { PayoutListItem } from "@/lib/dungeon-payout-types"
import { listGoldenAppleLinks } from "@/lib/golden-apple-fs"
import type { PublicPayoutRow } from "@/lib/public-payout-types"

export type { PublicPayoutRow } from "@/lib/public-payout-types"
export { asPayoutListItems } from "@/lib/public-payout-types"

/** All dungeon payouts for the public sheet (CP + Golden Light apples). */
export async function listPublicPayouts(): Promise<PublicPayoutRow[]> {
  const [all, appleFile] = await Promise.all([
    listPayouts(),
    listGoldenAppleLinks().catch(() => null),
  ])
  const applesById = new Map(
    (appleFile?.links ?? []).map((l) => [l.payoutId, l.apples] as const)
  )
  return all
    .map((p) => toPublicRow(p, applesById.get(p.id) ?? null))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function toPublicRow(
  p: PayoutListItem,
  apples: number | null
): PublicPayoutRow {
  return {
    id: p.id,
    name: p.name,
    cp: p.cp,
    apples,
    enabled: p.enabled,
    family: p.family,
    difficulty: p.difficulty,
    mode: p.mode,
    variantLabel: p.variantLabel,
  }
}
