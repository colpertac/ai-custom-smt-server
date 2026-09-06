import {
  loadShopProducts,
  type ShopProductInfo,
  type ShopProductsFile,
} from "./shop-products.ts"

export type ResolvedShopProduct = {
  productId: number
  itemId: number
  stack: number
  isCp: boolean
  name?: string
}

let itemToProductCache: Map<number, ResolvedShopProduct> | null | undefined

function buildItemToProductMap(
  file: ShopProductsFile | null
): Map<number, ResolvedShopProduct> {
  const map = new Map<number, ResolvedShopProduct>()
  if (!file?.products) return map

  type Candidate = { productId: number; info: ShopProductInfo }
  const byItem = new Map<number, Candidate[]>()

  for (const [idStr, info] of Object.entries(file.products)) {
    const productId = Number(idStr)
    if (!Number.isInteger(productId) || productId <= 0) continue
    if (!info || typeof info.itemId !== "number") continue
    const list = byItem.get(info.itemId) ?? []
    list.push({ productId, info })
    byItem.set(info.itemId, list)
  }

  for (const [itemId, candidates] of byItem) {
    // Prefer stack === 1, then productId === itemId, then lowest productId.
    candidates.sort((a, b) => {
      const stackA = a.info.stack === 1 ? 0 : 1
      const stackB = b.info.stack === 1 ? 0 : 1
      if (stackA !== stackB) return stackA - stackB
      const exactA = a.productId === itemId ? 0 : 1
      const exactB = b.productId === itemId ? 0 : 1
      if (exactA !== exactB) return exactA - exactB
      return a.productId - b.productId
    })
    const best = candidates[0]!
    map.set(itemId, {
      productId: best.productId,
      itemId,
      stack: best.info.stack,
      isCp: best.info.isCp,
      name: best.info.name,
    })
  }

  return map
}

function getItemToProductMap(): Map<number, ResolvedShopProduct> | null {
  if (itemToProductCache !== undefined) return itemToProductCache
  const file = loadShopProducts()
  if (!file) {
    itemToProductCache = null
    return null
  }
  itemToProductCache = buildItemToProductMap(file)
  return itemToProductCache
}

/** Resolve wiki item ID → preferred ShopProductData product ID. */
export function resolveProductForItem(
  itemId: number
): ResolvedShopProduct | null {
  const map = getItemToProductMap()
  if (!map) return null
  return map.get(itemId) ?? null
}

export function shopProductsExtractPresent(): boolean {
  return loadShopProducts() != null
}

/** Test helper. */
export function clearStoreProductMapCache(): void {
  itemToProductCache = undefined
}

/** Test helper — build map from an in-memory extract. */
export function buildItemToProductMapForTests(
  products: Record<string, ShopProductInfo>
): Map<number, ResolvedShopProduct> {
  return buildItemToProductMap({ version: 1, products })
}
