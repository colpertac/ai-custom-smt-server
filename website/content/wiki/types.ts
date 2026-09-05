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

export type WikiStatBucket = "basic" | "characteristic" | "any"

export type WikiSearchOptions = {
  category?: WikiItemCategory | "all"
  slot?: string
  /** CorrectTbl id filter (e.g. COOLDOWN_TIME). Matches S2/S3 rows. */
  stat?: string
  /** Which feature bucket to search; default any. */
  statBucket?: WikiStatBucket
  /** Minimum absolute value of the matched stat row. */
  statMin?: number
  /**
   * Character gender for wearable filter: 0 male, 1 female.
   * Keeps gender-any (2) plus matching lock.
   */
  gender?: 0 | 1
  limit?: number
  offset?: number
}

export type WikiCatalogSource = "runtime" | "bundled"
