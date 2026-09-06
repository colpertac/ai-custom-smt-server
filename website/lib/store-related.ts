import { getWikiItemCategory } from "@/content/wiki/format"
import type { WikiItem } from "@/content/wiki/types"
import { loadWikiItemsPayload } from "@/lib/wiki-catalog-load"
import { priceWikiItem } from "@/lib/store-price-resolve"

export type RelatedStoreItem = {
  itemId: number
  name: string
  iconSrc: string | null
  equipSlot: string
  category: string
  cp: number
  sellable: boolean
  reason?: string
}

/**
 * Suggest sellable wiki items related to the cart seed set
 * (same equip slot first, then same category).
 */
export function findRelatedStoreItems(
  seedItemIds: number[],
  limit = 6
): RelatedStoreItem[] {
  const capped = Math.min(12, Math.max(1, Math.floor(limit)))
  const seeds = seedItemIds.filter((n) => Number.isInteger(n) && n > 0)
  if (seeds.length === 0) return []

  const all = loadWikiItemsPayload().data.items
  const byId = new Map(all.map((item) => [item.id, item]))
  const seedItems = seeds
    .map((id) => byId.get(id))
    .filter((item): item is WikiItem => item != null)
  if (seedItems.length === 0) return []

  const exclude = new Set(seeds)
  const seedSlots = new Set(
    seedItems.map((i) => (i.equipSlot || "").toLowerCase()).filter(Boolean)
  )
  const seedCategories = new Set(seedItems.map((i) => getWikiItemCategory(i)))

  const scored: { item: WikiItem; score: number }[] = []
  for (const item of all) {
    if (exclude.has(item.id)) continue
    const slot = (item.equipSlot || "").toLowerCase()
    const category = getWikiItemCategory(item)
    let score = 0
    if (slot && seedSlots.has(slot)) score += 3
    if (seedCategories.has(category)) score += 1
    if (score === 0) continue
    // Light bias toward higher-level gear in the same niche
    score += Math.min(2, (item.level || 0) / 50)
    scored.push({ item, score })
  }

  scored.sort((a, b) => b.score - a.score || b.item.level - a.item.level)

  const out: RelatedStoreItem[] = []
  for (const { item } of scored) {
    const priced = priceWikiItem(item)
    if (!priced.sellable) continue
    out.push({
      itemId: item.id,
      name: item.name,
      iconSrc: item.iconSrc ?? null,
      equipSlot: item.equipSlot,
      category: getWikiItemCategory(item),
      cp: priced.cp,
      sellable: true,
    })
    if (out.length >= capped) break
  }
  return out
}
