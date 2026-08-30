import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  parseCompShopXml,
  serializeCompShop,
  type CompShop,
} from "@/lib/comp-shop-xml"

const MAX_TABS = 100

export function getShopsDir(): string {
  if (process.env.COMP_SHOPS_DIR) {
    return path.resolve(process.env.COMP_SHOPS_DIR)
  }
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../server-content/shops"
  )
}

export function shopFilename(shopId: number): string {
  return `compshop-${shopId}.xml`
}

export function shopPath(shopId: number): string {
  return path.join(getShopsDir(), shopFilename(shopId))
}

export type ShopListItem = {
  shopId: number
  name: string
  type: string
  tabCount: number
  productCount: number
  filename: string
}

export async function listWorkingShops(): Promise<ShopListItem[]> {
  const dir = getShopsDir()
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }

  const shops: ShopListItem[] = []
  for (const filename of entries) {
    if (!/^compshop-\d+\.xml$/i.test(filename)) continue
    const xml = await fs.readFile(path.join(dir, filename), "utf8")
    const shop = parseCompShopXml(xml, filename)
    shops.push({
      shopId: shop.shopId,
      name: shop.name,
      type: shop.type,
      tabCount: shop.tabs.length,
      productCount: shop.tabs.reduce((n, t) => n + t.products.length, 0),
      filename,
    })
  }
  shops.sort((a, b) => a.shopId - b.shopId)
  return shops
}

export async function readWorkingShop(shopId: number): Promise<CompShop> {
  const filename = shopFilename(shopId)
  const file = shopPath(shopId)
  let xml: string
  try {
    xml = await fs.readFile(file, "utf8")
  } catch {
    throw new ShopNotFoundError(shopId)
  }
  const shop = parseCompShopXml(xml, filename)
  if (shop.shopId !== shopId) {
    throw new Error(
      `Shop file ${filename} has ShopID ${shop.shopId}, expected ${shopId}`
    )
  }
  return shop
}

export class ShopNotFoundError extends Error {
  constructor(shopId: number) {
    super(`Shop ${shopId} not found in working copy`)
    this.name = "ShopNotFoundError"
  }
}

export type ShopValidationIssue = { path: string; message: string }

export function validateCompShop(
  shop: CompShop,
  knownProductIds?: Set<number> | null
): ShopValidationIssue[] {
  const issues: ShopValidationIssue[] = []
  if (!Number.isInteger(shop.shopId) || shop.shopId <= 0) {
    issues.push({ path: "shopId", message: "ShopID must be a positive integer" })
  }
  if (!shop.name?.trim()) {
    issues.push({ path: "name", message: "Name is required" })
  }
  if (shop.tabs.length > MAX_TABS) {
    issues.push({
      path: "tabs",
      message: `At most ${MAX_TABS} tabs (server cap)`,
    })
  }
  shop.tabs.forEach((tab, ti) => {
    if (!tab.name?.trim()) {
      issues.push({ path: `tabs[${ti}].name`, message: "Tab name is required" })
    }
    tab.products.forEach((p, pi) => {
      const base = `tabs[${ti}].products[${pi}]`
      if (!Number.isInteger(p.productId) || p.productId <= 0) {
        issues.push({
          path: `${base}.productId`,
          message: "ProductID must be a positive integer",
        })
      } else if (knownProductIds && !knownProductIds.has(p.productId)) {
        issues.push({
          path: `${base}.productId`,
          message: `ProductID ${p.productId} not in ShopProductData extract`,
        })
      }
      if (!Number.isInteger(p.basePrice) || p.basePrice < 0) {
        issues.push({
          path: `${base}.basePrice`,
          message: "BasePrice must be an integer ≥ 0",
        })
      }
    })
  })
  return issues
}

export async function shopExists(shopId: number): Promise<boolean> {
  try {
    await fs.access(shopPath(shopId))
    return true
  } catch {
    return false
  }
}

export class ShopConflictError extends Error {
  constructor(shopId: number) {
    super(`Shop ${shopId} already exists in working copy`)
    this.name = "ShopConflictError"
  }
}

export function emptyCompShop(shopId: number, name: string): CompShop {
  return {
    shopId,
    name: name.trim(),
    type: "COMP_SHOP",
    filename: shopFilename(shopId),
    passthrough: [],
    tabs: [{ name: "New tab", products: [], passthrough: [] }],
  }
}

export async function writeWorkingShop(shop: CompShop): Promise<void> {
  const dir = getShopsDir()
  await fs.mkdir(dir, { recursive: true })
  const file = shopPath(shop.shopId)
  const xml = serializeCompShop({
    ...shop,
    filename: shopFilename(shop.shopId),
  })
  await fs.writeFile(file, xml, "utf8")
}

/** Create a new working-copy shop; fails if `compshop-{id}.xml` already exists. */
export async function createWorkingShop(shop: CompShop): Promise<void> {
  if (await shopExists(shop.shopId)) {
    throw new ShopConflictError(shop.shopId)
  }
  await writeWorkingShop(shop)
}

export async function deleteWorkingShop(shopId: number): Promise<void> {
  if (!(await shopExists(shopId))) {
    throw new ShopNotFoundError(shopId)
  }
  await fs.unlink(shopPath(shopId))
}
