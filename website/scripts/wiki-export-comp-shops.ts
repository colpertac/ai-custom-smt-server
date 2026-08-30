/**
 * Build wiki reverse index: item ID → COMP shop listings.
 *
 * Usage (from website/):
 *   pnpm exec tsx --tsconfig tsconfig.json scripts/wiki-export-comp-shops.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { parseCompShopXml } from "../lib/comp-shop-xml.ts"
import {
  loadShopProducts,
  resolveShopProduct,
  type ShopProductInfo,
} from "../lib/shop-products.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(here, "..")
const repoRoot = path.resolve(websiteRoot, "..")

const shopsDir =
  process.env.COMP_SHOPS_DIR ??
  path.join(repoRoot, "server-content/shops")
const outPath =
  process.env.WIKI_COMP_SHOPS_OUT ??
  path.join(websiteRoot, "content/wiki/item-comp-shops.json")

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

export function resolveListingItemId(
  products: Record<string, ShopProductInfo> | null,
  productId: number
): { itemId: number; currency: "Macca" | "CP" } | null {
  const row = resolveShopProduct(products, productId)
  if (row && row.itemId > 0) {
    return { itemId: row.itemId, currency: row.isCp ? "CP" : "Macca" }
  }
  // Some working-copy shops use raw item IDs as ProductID.
  if (productId > 0) {
    return { itemId: productId, currency: "Macca" }
  }
  return null
}

export function buildCompShopSourcesIndex(
  shopFiles: Array<{ filename: string; xml: string }>,
  products: Record<string, ShopProductInfo> | null
): WikiCompShopSourcesPayload["byItemId"] {
  const byItemId: Record<string, WikiCompShopListing[]> = {}

  for (const { filename, xml } of shopFiles) {
    const shop = parseCompShopXml(xml, filename)
    if (shop.type !== "COMP_SHOP") continue

    for (const tab of shop.tabs) {
      for (const product of tab.products) {
        const resolved = resolveListingItemId(products, product.productId)
        if (!resolved) continue

        const listing: WikiCompShopListing = {
          shopId: shop.shopId,
          shopName: shop.name,
          tabName: tab.name,
          productId: product.productId,
          itemId: resolved.itemId,
          basePrice: product.basePrice,
          currency: resolved.currency,
        }

        const key = String(resolved.itemId)
        const bucket = byItemId[key] ?? []
        const dup = bucket.some(
          (row) =>
            row.shopId === listing.shopId &&
            row.tabName === listing.tabName &&
            row.productId === listing.productId
        )
        if (!dup) bucket.push(listing)
        byItemId[key] = bucket
      }
    }
  }

  for (const key of Object.keys(byItemId)) {
    byItemId[key].sort((a, b) => a.shopId - b.shopId || a.tabName.localeCompare(b.tabName))
  }

  return byItemId
}

function main(): void {
  const productsFile = loadShopProducts()
  const products = productsFile?.products ?? null

  const filenames = readdirSync(shopsDir)
    .filter((name) => /^compshop-\d+\.xml$/i.test(name))
    .sort()

  const shopFiles = filenames.map((filename) => ({
    filename,
    xml: readFileSync(path.join(shopsDir, filename), "utf8"),
  }))

  const payload: WikiCompShopSourcesPayload = {
    source: "server-content/shops/compshop-*.xml",
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    shopsScanned: shopFiles.length,
    note: "Managed COMP shops only — not world NPC shops, drops, or quests.",
    byItemId: buildCompShopSourcesIndex(shopFiles, products),
  }

  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  const itemCount = Object.keys(payload.byItemId).length
  console.log(
    `Wrote ${outPath} (${payload.shopsScanned} shops, ${itemCount} items with listings)`
  )
}

const isMain =
  process.argv[1] != null &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  main()
}
