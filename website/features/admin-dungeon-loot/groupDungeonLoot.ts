import type { ReportRewardListItem } from "@/lib/report-reward-types"

export type SheetDifficulty = "bronze" | "silver" | "gold"

export type DungeonLootFamilyRow = {
  family: string
  bronze?: ReportRewardListItem
  silver?: ReportRewardListItem
  gold?: ReportRewardListItem
  variants: ReportRewardListItem[]
}

function familyKey(item: ReportRewardListItem): string {
  return item.family?.trim() || "Ungrouped"
}

function isCoreTier(item: ReportRewardListItem): item is ReportRewardListItem & {
  difficulty: SheetDifficulty
} {
  const d = item.difficulty?.toLowerCase()
  return d === "bronze" || d === "silver" || d === "gold"
}

export function groupDungeonLootByFamily(
  list: ReportRewardListItem[]
): DungeonLootFamilyRow[] {
  const map = new Map<string, DungeonLootFamilyRow>()

  for (const item of list) {
    const family = familyKey(item)
    let row = map.get(family)
    if (!row) {
      row = { family, variants: [] }
      map.set(family, row)
    }

    if (isCoreTier(item)) {
      const slot = item.difficulty.toLowerCase() as SheetDifficulty
      const existing = row[slot]
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

export function variantDisplayLabel(item: ReportRewardListItem): string {
  if (item.difficulty && item.difficulty !== "bronze") {
    return item.name.replace(/\s*\([^)]*\)\s*$/, "").trim() || item.name
  }
  return item.name
}
