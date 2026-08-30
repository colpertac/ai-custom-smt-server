import type { PayoutListItem } from "@/lib/dungeon-payout-types"

export type SheetDifficulty = "bronze" | "silver" | "gold"

export type PayoutFamilyRow = {
  family: string
  bronze?: PayoutListItem
  silver?: PayoutListItem
  gold?: PayoutListItem
  /** Bearcat / boss / diaspora / special / non-normal modes */
  variants: PayoutListItem[]
}

function familyKey(item: PayoutListItem): string {
  return item.family?.trim() || "Ungrouped"
}

function isCoreTier(item: PayoutListItem): item is PayoutListItem & {
  difficulty: SheetDifficulty
} {
  const d = item.difficulty
  if (d !== "bronze" && d !== "silver" && d !== "gold") return false
  // Core B/S/G cells are normal mode only; bearcat bronze goes under Variants.
  const mode = item.mode ?? "normal"
  return mode === "normal"
}

/**
 * Group list items into sheet rows: family × Bronze/Silver/Gold + variants.
 */
export function groupPayoutsByFamily(
  list: PayoutListItem[]
): PayoutFamilyRow[] {
  const map = new Map<string, PayoutFamilyRow>()

  for (const item of list) {
    const family = familyKey(item)
    let row = map.get(family)
    if (!row) {
      row = { family, variants: [] }
      map.set(family, row)
    }

    if (isCoreTier(item)) {
      const slot = item.difficulty
      const existing = row[slot]
      // Prefer enabled if duplicate tier; else first wins then overwrite only if empty
      if (!existing || (!existing.enabled && item.enabled)) {
        row[slot] = item
      } else if (existing.id !== item.id) {
        row.variants.push(item)
      }
    } else {
      row.variants.push(item)
    }
  }

  for (const row of map.values()) {
    row.variants.sort((a, b) => a.name.localeCompare(b.name))
  }

  return [...map.values()].sort((a, b) => a.family.localeCompare(b.family))
}

export function variantDisplayLabel(item: PayoutListItem): string {
  if (item.variantLabel) return item.variantLabel
  // Derive from name in parentheses if present
  const m = item.name.match(/\(([^)]+)\)\s*$/)
  if (m) return m[1]
  return item.name
}
