import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type ShopProductInfo = {
  itemId: number
  stack: number
  isCp: boolean
  name?: string
}

export type ShopProductsFile = {
  version: number
  products: Record<string, ShopProductInfo>
}

let cached: ShopProductsFile | null | undefined

function defaultProductsPath(): string {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../content/shops/shop-products.json"
  )
}

export function loadShopProducts(
  filePath = process.env.SHOP_PRODUCTS_PATH || defaultProductsPath()
): ShopProductsFile | null {
  if (cached !== undefined) return cached
  try {
    const raw = readFileSync(filePath, "utf8")
    cached = JSON.parse(raw) as ShopProductsFile
    return cached
  } catch {
    cached = null
    return null
  }
}

/** Test helper — clear memoized extract. */
export function clearShopProductsCache(): void {
  cached = undefined
}

export function resolveShopProduct(
  products: Record<string, ShopProductInfo> | null | undefined,
  productId: number
): ShopProductInfo | null {
  if (!products) return null
  return products[String(productId)] ?? null
}
