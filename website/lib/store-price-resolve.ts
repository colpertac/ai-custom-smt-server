import type { WikiItem } from "@/content/wiki/types"
import { loadWikiItemsPayload } from "@/lib/wiki-catalog-load"
import {
  getStorePriceFormula,
  getStorePriceOverride,
  getStorePriceOverridesMap,
} from "@/lib/store-prices-store"
import {
  isItemDenylisted,
  resolveStorePrice,
  type PriceBreakdown,
  type PriceSource,
  type StorePriceFormula,
} from "@/lib/store-pricing"
import {
  resolveProductForItem,
  shopProductsExtractPresent,
  type ResolvedShopProduct,
} from "@/lib/store-product-map"

function getWikiItem(id: number): WikiItem | undefined {
  return loadWikiItemsPayload().data.items.find((item) => item.id === id)
}

export type StoreItemPriceView = {
  itemId: number
  name: string
  cp: number
  source: PriceSource
  sellable: boolean
  reason?: string
  product: ResolvedShopProduct | null
  breakdown: PriceBreakdown | null
}

export function priceWikiItem(
  item: WikiItem,
  opts?: {
    formula?: StorePriceFormula
    overrideCp?: number | null
  }
): StoreItemPriceView {
  const formula = opts?.formula ?? getStorePriceFormula()
  const overrideCp =
    opts?.overrideCp !== undefined
      ? opts.overrideCp
      : (getStorePriceOverride(item.id)?.cp ?? null)

  if (isItemDenylisted(item.id, formula)) {
    return {
      itemId: item.id,
      name: item.name,
      cp: 0,
      source: "formula",
      sellable: false,
      reason: "Item is blocked from the web store",
      product: null,
      breakdown: null,
    }
  }

  if (!shopProductsExtractPresent()) {
    return {
      itemId: item.id,
      name: item.name,
      cp: 0,
      source: "formula",
      sellable: false,
      reason: "Shop product extract missing",
      product: null,
      breakdown: null,
    }
  }

  const product = resolveProductForItem(item.id)
  if (!product) {
    return {
      itemId: item.id,
      name: item.name,
      cp: 0,
      source: "formula",
      sellable: false,
      reason: "No ShopProductData mapping for this item",
      product: null,
      breakdown: null,
    }
  }

  const resolved = resolveStorePrice(item, formula, overrideCp)
  return {
    itemId: item.id,
    name: item.name,
    cp: resolved.cp,
    source: resolved.source,
    sellable: true,
    product,
    breakdown: resolved.breakdown,
  }
}

export function priceWikiItems(itemIds: number[]): StoreItemPriceView[] {
  const formula = getStorePriceFormula()
  const overrides = getStorePriceOverridesMap(itemIds)
  return itemIds.map((id) => {
    const item = getWikiItem(id)
    if (!item) {
      return {
        itemId: id,
        name: `Unknown #${id}`,
        cp: 0,
        source: "formula" as const,
        sellable: false,
        reason: "Unknown wiki item",
        product: null,
        breakdown: null,
      }
    }
    return priceWikiItem(item, {
      formula,
      overrideCp: overrides.get(id) ?? null,
    })
  })
}
