import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  parseCompShopXml,
  serializeCompShop,
  type CompShop,
} from "./comp-shop-xml.ts"

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
      if (p.merchantDescription !== undefined) {
        if (
          !Number.isInteger(p.merchantDescription) ||
          p.merchantDescription < 0 ||
          p.merchantDescription > 255
        ) {
          issues.push({
            path: `${base}.merchantDescription`,
            message:
              "MerchantDescription must be a u8 id (0–255), not free text — invalid values crash the channel",
          })
        }
      }
      if (p.moonRestrict !== undefined && p.moonRestrict !== "") {
        const moon = Number.parseInt(p.moonRestrict, 0)
        if (!Number.isFinite(moon) || moon < 0 || moon > 65535) {
          issues.push({
            path: `${base}.moonRestrict`,
            message: "MoonRestrict must be a u16 (decimal or 0x… hex)",
          })
        }
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

export class ShopImportValidationError extends Error {
  readonly issues: ShopValidationIssue[]

  constructor(issues: ShopValidationIssue[]) {
    super(issues[0]?.message ?? "Invalid shop XML")
    this.name = "ShopImportValidationError"
    this.issues = issues
  }
}

export type ImportWorkingShopResult = {
  shopId: number
  originalShopId: number
  shopIdChanged: boolean
  name: string
  filename: string
  tabCount: number
  productCount: number
  warnings: string[]
}

/** Next free ShopID when `preferred` is taken (max existing + 1). */
export async function resolveAvailableShopId(
  preferred: number
): Promise<{ shopId: number; changed: boolean }> {
  if (Number.isInteger(preferred) && preferred > 0 && !(await shopExists(preferred))) {
    return { shopId: preferred, changed: false }
  }
  const shops = await listWorkingShops()
  const next =
    shops.length > 0
      ? Math.max(...shops.map((s) => s.shopId), preferred > 0 ? preferred : 0) + 1
      : preferred > 0
        ? preferred
        : 9000
  return { shopId: next, changed: preferred !== next }
}

export async function importWorkingShopFromXml(
  xml: string,
  sourceFilename: string
): Promise<ImportWorkingShopResult> {
  let parsed: CompShop
  try {
    parsed = parseCompShopXml(xml, sourceFilename)
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Failed to parse shop XML"
    )
  }

  const warnings: string[] = []
  const originalShopId = parsed.shopId
  const { shopId, changed } = await resolveAvailableShopId(parsed.shopId)
  if (!Number.isInteger(originalShopId) || originalShopId <= 0) {
    warnings.push(
      `XML had invalid ShopID (${String(originalShopId)}); assigned ${shopId}`
    )
  } else if (changed) {
    warnings.push(`ShopID ${originalShopId} already exists; assigned ${shopId}`)
  }

  const shop: CompShop = {
    ...parsed,
    shopId,
    filename: shopFilename(shopId),
  }

  const issues = validateCompShop(shop, null)
  if (issues.length) {
    throw new ShopImportValidationError(issues)
  }

  await writeWorkingShop(shop)

  return {
    shopId,
    originalShopId,
    shopIdChanged: shopId !== originalShopId,
    name: shop.name,
    filename: shop.filename,
    tabCount: shop.tabs.length,
    productCount: shop.tabs.reduce((n, t) => n + t.products.length, 0),
    warnings,
  }
}
