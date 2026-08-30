import catalog from "@/content/wiki/items.json"
import enchantCatalog from "@/content/wiki/enchants.json"
import compShopSourcesCatalog from "@/content/wiki/item-comp-shops.json"

export type WikiItemStat = {
  id: string
  label: string
  type: number
  value: number
}

export type WikiItem = {
  id: number
  name: string
  description: string
  icon: number
  iconAsset?: string | null
  iconSrc?: string | null
  equipType: string
  equipSlot: string
  weaponType: string | null
  /** COMP: 0 male, 1 female, 2 any */
  gender: number
  genderLabel: string
  buyPrice: number
  sellPrice: number
  level: number
  durability: number
  stackSize: number
  /** S1 — set bonus / appearance performance (tokusei from SItemData). */
  setBonus?: string[]
  /** S2 — basic features (correctTbl type 0). */
  basicFeatures?: WikiItemStat[]
  /** S3 — characteristics (correctTbl type 1/2). */
  characteristics?: WikiItemStat[]
  /** Legacy preview column — basic features only. */
  stats: WikiItemStat[]
}

export type WikiItemsPayload = {
  source: string
  namesSource: string
  iconsSource?: string
  generatedAt: string
  note: string
  items: WikiItem[]
}

export type WikiEnchantCharastic = {
  name: string
  desc: string
  tokuseiIds?: number[]
  conditions?: {
    type: number
    params: number[]
    tokuseiIds: number[]
  }[]
  lines: string[]
}

export type WikiEnchantRecord = {
  id: number
  demonId: number
  crystalItemId: number
  sourceName: string | null
  usage: number
  tarot: WikiEnchantCharastic
  soul: WikiEnchantCharastic
}

export type WikiEnchantsPayload = {
  source: string
  generatedAt: string
  note: string
  enchantEnableEffect: number
  enchants: Record<string, WikiEnchantRecord>
  byCrystalItemId: Record<string, number>
}

/** Resolved tarot / soul fusion block for tooltips and wiki. */
export type WikiFusionView = {
  enchantId: number
  sourceItemId: number
  sourceName: string
  effectName: string | null
  lines: string[]
}

export type WikiCompShopListing = {
  shopId: number
  shopName: string
  tabName: string
  productId: number
  itemId: number
  basePrice: number
  currency: "Macca" | "CP"
}

export type WikiCompShopSourcesPayload = {
  source: string
  generatedAt: string
  shopsScanned: number
  note: string
  byItemId: Record<string, WikiCompShopListing[]>
}

/** Browse buckets for Item DB cards / filtered lists. */
export type WikiItemCategory = "weapons" | "armor" | "items"

export const wikiCatalog = catalog as WikiItemsPayload
export const wikiEnchantCatalog = enchantCatalog as WikiEnchantsPayload
export const wikiCompShopSourcesCatalog =
  compShopSourcesCatalog as WikiCompShopSourcesPayload

const ENCHANT_ENABLE_EFFECT = wikiEnchantCatalog.enchantEnableEffect

const itemsById = new Map<number, WikiItem>(
  wikiCatalog.items.map((item) => [item.id, item])
)

const enchantsById = new Map<number, WikiEnchantRecord>(
  Object.values(wikiEnchantCatalog.enchants).map((row) => [row.id, row])
)

const WEAPON_EQUIP_TYPES = new Set(["EQUIP_TYPE_WEAPON"])

const ARMOR_EQUIP_TYPES = new Set([
  "EQUIP_TYPE_HEAD",
  "EQUIP_TYPE_FACE",
  "EQUIP_TYPE_NECK",
  "EQUIP_TYPE_EARRING",
  "EQUIP_TYPE_TOP",
  "EQUIP_TYPE_BOTTOM",
  "EQUIP_TYPE_ARMS",
  "EQUIP_TYPE_BACK",
  "EQUIP_TYPE_FEET",
  "EQUIP_TYPE_RING",
  "EQUIP_TYPE_TALISMAN",
  "EQUIP_TYPE_EXTRA",
  "EQUIP_TYPE_COMP",
])

export function getWikiItemCategory(item: WikiItem): WikiItemCategory {
  const equip = item.equipType || ""
  if (WEAPON_EQUIP_TYPES.has(equip)) return "weapons"
  if (equip === "EQUIP_TYPE_WEAPON") return "weapons"
  if (ARMOR_EQUIP_TYPES.has(equip)) return "armor"
  const slot = (item.equipSlot || "").toLowerCase()
  if (slot === "weapon") return "weapons"
  if (
    [
      "head",
      "face",
      "neck",
      "earring",
      "top",
      "bottom",
      "arms",
      "back",
      "feet",
      "ring",
      "talisman",
      "extra",
      "comp",
    ].includes(slot)
  ) {
    return "armor"
  }
  return "items"
}

export function getWikiItem(id: number): WikiItem | undefined {
  return itemsById.get(id)
}

/** S2 — basic features (correctTbl type 0). */
export function wikiBasicFeatures(item: WikiItem): WikiItemStat[] {
  if (item.basicFeatures) return item.basicFeatures
  return item.stats.filter((row) => row.type === 0)
}

/** S3 — characteristics (correctTbl type 1/2). */
export function wikiCharacteristics(item: WikiItem): WikiItemStat[] {
  if (item.characteristics) return item.characteristics
  return item.stats.filter((row) => row.type === 1 || row.type === 2)
}

/** S1 — set bonus lines from SItem tokusei. */
export function wikiSetBonus(item: WikiItem): string[] {
  return item.setBonus ?? []
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

/** Tarot fusion on worn gear — enchant ID stored in item.tarot. */
export function resolveTarotFusionByEnchantId(id: number): WikiFusionView | null {
  if (!isActiveEnchantId(id)) return null
  const enchant = getWikiEnchant(id)
  if (!enchant) return null
  return buildFusionView(enchant, enchant.tarot, enchant.crystalItemId)
}

/** Soul fusion on worn gear — enchant ID stored in item.soul. */
export function resolveSoulFusionByEnchantId(id: number): WikiFusionView | null {
  if (!isActiveEnchantId(id)) return null
  const enchant = getWikiEnchant(id)
  if (!enchant) return null
  return buildFusionView(enchant, enchant.soul, enchant.crystalItemId)
}

/** Tarot fusion granted by a tarot card or crystal item row. */
export function wikiItemTarotFusion(item: WikiItem): WikiFusionView | null {
  const enchantId = wikiEnchantCatalog.byCrystalItemId[String(item.id)]
  if (!enchantId) return null
  const enchant = getWikiEnchant(enchantId)
  if (!enchant) return null
  return buildFusionView(enchant, enchant.tarot, item.id)
}

/** Soul fusion granted by a devil crystal item row. */
export function wikiItemSoulFusion(item: WikiItem): WikiFusionView | null {
  const enchantId = wikiEnchantCatalog.byCrystalItemId[String(item.id)]
  if (!enchantId) return null
  const enchant = getWikiEnchant(enchantId)
  if (!enchant) return null
  return buildFusionView(enchant, enchant.soul, item.id)
}

/** Managed COMP shop listings that sell this item. */
export function wikiItemCompShops(itemId: number): WikiCompShopListing[] {
  return wikiCompShopSourcesCatalog.byItemId[String(itemId)] ?? []
}

export function formatWikiStatValue(stat: WikiItemStat): string {
  const id = stat.id
  if (
    id.startsWith("RATE_") ||
    id.startsWith("BOOST_") ||
    id === "LB_CHANCE" ||
    id === "LB_DAMAGE" ||
    id === "FINAL_CRIT_CHANCE" ||
    id === "CHANT_TIME" ||
    id === "COOLDOWN_TIME"
  ) {
    return stat.value > 0 ? `+${stat.value}%` : `${stat.value}%`
  }
  return stat.value > 0 ? `+${stat.value}` : String(stat.value)
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

export type WikiSearchOptions = {
  category?: WikiItemCategory | "all"
  slot?: string
  limit?: number
  offset?: number
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

export const wikiArmorSlots = [...new Set(
  listWikiItems("armor").map((item) => item.equipSlot)
)].sort()

