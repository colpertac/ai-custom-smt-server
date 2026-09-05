import bakedItems from "@/content/wiki/items.json"
import bakedEnchants from "@/content/wiki/enchants.json"
import bakedCompShops from "@/content/wiki/item-comp-shops.json"
import {
  formatWikiStatValue,
  getWikiItemCategory,
  wikiBasicFeatures,
  wikiCharacteristics,
  wikiItemFitsGender,
  wikiSetBonus,
} from "@/content/wiki/format"
import type {
  WikiCompShopListing,
  WikiCompShopSourcesPayload,
  WikiEnchantCharastic,
  WikiEnchantRecord,
  WikiEnchantsPayload,
  WikiFusionView,
  WikiItem,
  WikiItemCategory,
  WikiItemsPayload,
  WikiItemStat,
  WikiSearchOptions,
  WikiStatBucket,
} from "@/content/wiki/types"

export type {
  WikiCatalogSource,
  WikiCompShopListing,
  WikiCompShopSourcesPayload,
  WikiEnchantCharastic,
  WikiEnchantRecord,
  WikiEnchantsPayload,
  WikiFusionView,
  WikiItem,
  WikiItemCategory,
  WikiItemsPayload,
  WikiItemStat,
  WikiSearchOptions,
  WikiStatBucket,
} from "@/content/wiki/types"

export {
  formatWikiStatValue,
  getWikiItemCategory,
  wikiBasicFeatures,
  wikiCharacteristics,
  wikiItemFitsGender,
  wikiSetBonus,
} from "@/content/wiki/format"

/** Baked items catalog (client + tests). Server routes prefer `@/lib/wiki-catalog`. */
export const wikiCatalog = bakedItems as WikiItemsPayload
export const wikiEnchantCatalog = bakedEnchants as WikiEnchantsPayload
export const wikiCompShopSourcesCatalog =
  bakedCompShops as WikiCompShopSourcesPayload

const ENCHANT_ENABLE_EFFECT = wikiEnchantCatalog.enchantEnableEffect

const itemsById = new Map<number, WikiItem>(
  wikiCatalog.items.map((item) => [item.id, item])
)

const enchantsById = new Map<number, WikiEnchantRecord>(
  Object.values(wikiEnchantCatalog.enchants).map((row) => [row.id, row])
)

export function getWikiItemsPayload(): WikiItemsPayload {
  return wikiCatalog
}

export function getWikiEnchantsPayload(): WikiEnchantsPayload {
  return wikiEnchantCatalog
}

export function getWikiCatalogSource(): "runtime" | "bundled" {
  return "bundled"
}

export function getWikiItem(id: number): WikiItem | undefined {
  return itemsById.get(id)
}

export function listWikiEnchants(): WikiEnchantRecord[] {
  return [...enchantsById.values()]
}

export function isActiveEnchantId(id: number): boolean {
  return id > 0 && id !== ENCHANT_ENABLE_EFFECT
}

export function getWikiEnchant(id: number): WikiEnchantRecord | undefined {
  return enchantsById.get(id)
}

function fusionSourceName(enchant: WikiEnchantRecord): string {
  if (enchant.sourceName) return enchant.sourceName
  const item = getWikiItem(enchant.crystalItemId)
  return item?.name ?? `Item ${enchant.crystalItemId}`
}

function buildFusionView(
  enchant: WikiEnchantRecord,
  side: WikiEnchantCharastic,
  sourceItemId: number
): WikiFusionView | null {
  const effectName = side.name.trim() || null
  const lines = side.lines.filter((line) => line.trim().length > 0)
  if (!effectName && lines.length === 0) return null
  return {
    enchantId: enchant.id,
    sourceItemId,
    sourceName: fusionSourceName(enchant),
    effectName,
    lines,
  }
}

export function resolveTarotFusionByEnchantId(id: number): WikiFusionView | null {
  if (!isActiveEnchantId(id)) return null
  const enchant = getWikiEnchant(id)
  if (!enchant) return null
  return buildFusionView(enchant, enchant.tarot, enchant.crystalItemId)
}

export function resolveSoulFusionByEnchantId(id: number): WikiFusionView | null {
  if (!isActiveEnchantId(id)) return null
  const enchant = getWikiEnchant(id)
  if (!enchant) return null
  return buildFusionView(enchant, enchant.soul, enchant.crystalItemId)
}

export function wikiItemTarotFusion(item: WikiItem): WikiFusionView | null {
  const enchantId = wikiEnchantCatalog.byCrystalItemId[String(item.id)]
  if (!enchantId) return null
  const enchant = getWikiEnchant(enchantId)
  if (!enchant) return null
  return buildFusionView(enchant, enchant.tarot, item.id)
}

export function wikiItemSoulFusion(item: WikiItem): WikiFusionView | null {
  const enchantId = wikiEnchantCatalog.byCrystalItemId[String(item.id)]
  if (!enchantId) return null
  const enchant = getWikiEnchant(enchantId)
  if (!enchant) return null
  return buildFusionView(enchant, enchant.soul, item.id)
}

export function wikiItemCompShops(itemId: number): WikiCompShopListing[] {
  return wikiCompShopSourcesCatalog.byItemId[String(itemId)] ?? []
}

export function listWikiItems(category?: WikiItemCategory): WikiItem[] {
  if (!category) return wikiCatalog.items
  return wikiCatalog.items.filter(
    (item) => getWikiItemCategory(item) === category
  )
}

export function countWikiItems(category: WikiItemCategory): number {
  return listWikiItems(category).length
}

export function countWikiCatalog(): number {
  return wikiCatalog.items.length
}

function itemHasStat(
  item: WikiItem,
  statId: string,
  bucket: WikiStatBucket,
  statMin: number
): boolean {
  const id = statId.toUpperCase()
  const rows: WikiItemStat[] = []
  if (bucket === "basic" || bucket === "any") {
    rows.push(...wikiBasicFeatures(item))
  }
  if (bucket === "characteristic" || bucket === "any") {
    rows.push(...wikiCharacteristics(item))
  }
  return rows.some(
    (row) => row.id.toUpperCase() === id && Math.abs(row.value) >= statMin
  )
}

export function searchWikiCatalog(
  query: string,
  options: WikiSearchOptions = {}
): { total: number; items: WikiItem[]; offset: number; limit: number } {
  const limit = options.limit ?? 100
  const offset = Math.max(0, options.offset ?? 0)
  const category = options.category ?? "all"
  let pool =
    category === "all"
      ? wikiCatalog.items
      : listWikiItems(category as WikiItemCategory)

  if (options.slot) {
    const slot = options.slot.toLowerCase()
    pool = pool.filter((item) => item.equipSlot.toLowerCase() === slot)
  }

  if (options.stat) {
    const bucket = options.statBucket ?? "any"
    const statMin = options.statMin ?? 0
    pool = pool.filter((item) =>
      itemHasStat(item, options.stat!, bucket, statMin)
    )
  }

  if (options.gender === 0 || options.gender === 1) {
    pool = pool.filter((item) => wikiItemFitsGender(item, options.gender))
  }

  const q = query.trim().toLowerCase()
  const matched = q
    ? pool.filter(
        (item) =>
          item.name.toLowerCase().includes(q) || String(item.id).includes(q)
      )
    : pool

  return {
    total: matched.length,
    items: matched.slice(offset, offset + limit),
    offset,
    limit,
  }
}

/** @deprecated Use searchWikiCatalog */
export function searchWikiItems(
  category: WikiItemCategory,
  query: string,
  limit = 100
): { total: number; items: WikiItem[] } {
  return searchWikiCatalog(query, { category, limit })
}

export function listWikiArmorSlots(): string[] {
  return [
    ...new Set(listWikiItems("armor").map((item) => item.equipSlot)),
  ].sort()
}

export const wikiArmorSlots = listWikiArmorSlots()
