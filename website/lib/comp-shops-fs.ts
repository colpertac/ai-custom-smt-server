import { promises as fs } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  parseCompShopXml,
  serializeCompShop,
  type CompShop,
} from "./comp-shop-xml.ts"
import { applyShopSlotRemapToList, planShopSlotRemap } from "./comp-shop-order.ts"

export { applyShopSlotRemapToList, planShopSlotRemap } from "./comp-shop-order.ts"

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

/** Admin UI list order only — not published to the channel datastore. */
export const SHOP_ORDER_FILENAME = "shop-order.json"

function shopOrderPath(): string {
  return path.join(getShopsDir(), SHOP_ORDER_FILENAME)
}

async function readShopOrderIds(): Promise<number[]> {
  try {
    const raw = await fs.readFile(shopOrderPath(), "utf8")
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (id): id is number => Number.isInteger(id) && (id as number) > 0
    )
  } catch {
    return []
  }
}

async function writeShopOrderIds(shopIds: number[]): Promise<void> {
  const dir = getShopsDir()
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    shopOrderPath(),
    `${JSON.stringify(shopIds, null, 2)}\n`,
    "utf8"
  )
}

/** Keep known IDs in saved order; append any new IDs by ascending ShopID. */
export function mergeShopOrder(
  savedOrder: number[],
  shopIds: number[]
): number[] {
  const idSet = new Set(shopIds)
  const kept = savedOrder.filter((id) => idSet.has(id))
  const keptSet = new Set(kept)
  const missing = shopIds
    .filter((id) => !keptSet.has(id))
    .sort((a, b) => a - b)
  return [...kept, ...missing]
}

function sortShopsByOrder(
  shops: ShopListItem[],
  order: number[]
): ShopListItem[] {
  const byId = new Map(shops.map((s) => [s.shopId, s] as const))
  const result: ShopListItem[] = []
  const seen = new Set<number>()
  for (const id of order) {
    const shop = byId.get(id)
    if (!shop || seen.has(id)) continue
    result.push(shop)
    seen.add(id)
  }
  for (const shop of shops) {
    if (!seen.has(shop.shopId)) result.push(shop)
  }
  return result
}

async function appendShopToOrder(shopId: number): Promise<void> {
  const shops = await listWorkingShopsRaw()
  const ids = shops.map((s) => s.shopId)
  if (!ids.includes(shopId)) ids.push(shopId)
  const next = mergeShopOrder(await readShopOrderIds(), ids)
  await writeShopOrderIds(next)
}

async function removeShopFromOrder(shopId: number): Promise<void> {
  const shops = await listWorkingShopsRaw()
  const next = mergeShopOrder(
    (await readShopOrderIds()).filter((id) => id !== shopId),
    shops.map((s) => s.shopId)
  )
  await writeShopOrderIds(next)
}

/**
 * Reorder shops and reassign ShopIDs to match row slots.
 *
 * `contentOrderIds` = ShopIDs of shop *content* in the desired visual order
 * (ids before remapping). Position i keeps the ShopID that was previously at
 * position i; the shop that lands there is rewritten to that id / filename.
 *
 * Must be a permutation of every working-copy shop.
 */
export async function reorderWorkingShops(
  contentOrderIds: number[]
): Promise<ShopListItem[]> {
  const currentList = await listWorkingShops()
  const slotIds = currentList.map((s) => s.shopId)
  const current = new Set(slotIds)

  if (contentOrderIds.length !== current.size) {
    throw new ShopOrderValidationError(
      "shopIds must include every working-copy shop exactly once"
    )
  }
  const seen = new Set<number>()
  for (const id of contentOrderIds) {
    if (!current.has(id)) {
      throw new ShopOrderValidationError(`Unknown shop id ${id}`)
    }
    if (seen.has(id)) {
      throw new ShopOrderValidationError(`Duplicate shop id ${id}`)
    }
    seen.add(id)
  }

  const remap = planShopSlotRemap(slotIds, contentOrderIds)
  const changes = [...remap.entries()].filter(([from, to]) => from !== to)

  if (changes.length === 0) {
    await writeShopOrderIds(slotIds)
    return currentList
  }

  const maxExisting = Math.max(9_000_000, ...slotIds)
  const temps: { temp: number; to: number }[] = []
  let nextTemp = maxExisting + 1

  try {
    for (const [from, to] of changes) {
      const temp = nextTemp++
      await relocateShopId(from, temp)
      temps.push({ temp, to })
    }
    for (const { temp, to } of temps) {
      await relocateShopId(temp, to)
    }
  } catch (error) {
    throw error instanceof ShopOrderValidationError
      ? error
      : new ShopOrderValidationError(
          error instanceof Error
            ? `Shop ID remapping failed: ${error.message}`
            : "Shop ID remapping failed"
        )
  }

  await writeShopOrderIds(slotIds)
  return applyShopSlotRemapToList(currentList, contentOrderIds)
}

/** Move a shop XML to a new ShopID (file + member). Target must not exist. */
async function relocateShopId(fromId: number, toId: number): Promise<void> {
  if (fromId === toId) return
  if (await shopExists(toId)) {
    throw new ShopOrderValidationError(
      `Cannot move shop ${fromId} → ${toId}: target already exists`
    )
  }
  const shop = await readWorkingShop(fromId)
  await writeWorkingShop({
    ...shop,
    shopId: toId,
    filename: shopFilename(toId),
  })
  await fs.unlink(shopPath(fromId))
}

export class ShopOrderValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ShopOrderValidationError"
  }
}

async function listWorkingShopsRaw(): Promise<ShopListItem[]> {
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

export async function listWorkingShops(): Promise<ShopListItem[]> {
  const shops = await listWorkingShopsRaw()
  if (!shops.length) return shops
  const order = mergeShopOrder(
    await readShopOrderIds(),
    shops.map((s) => s.shopId)
  )
  return sortShopsByOrder(shops, order)
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
  await appendShopToOrder(shop.shopId)
}

export async function deleteWorkingShop(shopId: number): Promise<void> {
  if (!(await shopExists(shopId))) {
    throw new ShopNotFoundError(shopId)
  }
  await fs.unlink(shopPath(shopId))
  await removeShopFromOrder(shopId)
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

/**
 * Floor for auto-assigned import ShopIDs — keeps uploads out of stock
 * world/COMP ranges (301–647) unless those ids are already in the working copy.
 */
export const IMPORT_SHOP_ID_FLOOR = 6000

/** Next free ShopID for imports (always above floor and existing shops). */
export async function allocateNextImportShopId(): Promise<number> {
  const shops = await listWorkingShopsRaw()
  const maxExisting =
    shops.length > 0 ? Math.max(...shops.map((s) => s.shopId)) : 0
  return Math.max(IMPORT_SHOP_ID_FLOOR, maxExisting) + 1
}

/** Next free ShopID when `preferred` is taken (max existing + 1). */
export async function resolveAvailableShopId(
  preferred: number
): Promise<{ shopId: number; changed: boolean }> {
  if (Number.isInteger(preferred) && preferred > 0 && !(await shopExists(preferred))) {
    return { shopId: preferred, changed: false }
  }
  const shops = await listWorkingShopsRaw()
  const next =
    shops.length > 0
      ? Math.max(...shops.map((s) => s.shopId), preferred > 0 ? preferred : 0) + 1
      : preferred > 0
        ? preferred
        : IMPORT_SHOP_ID_FLOOR + 1
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
  // Always allocate a fresh id on upload so legacy loose-named live files
  // (e.g. "compshop 1 reku DCO.xml") cannot collide after publish.
  const shopId = await allocateNextImportShopId()
  if (!Number.isInteger(originalShopId) || originalShopId <= 0) {
    warnings.push(
      `XML had invalid ShopID (${String(originalShopId)}); assigned ${shopId}`
    )
  } else {
    warnings.push(
      `Assigned ShopID ${shopId} (XML had ${originalShopId}; uploads always get a fresh id)`
    )
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
  await appendShopToOrder(shopId)

  return {
    shopId,
    originalShopId,
    shopIdChanged: true,
    name: shop.name,
    filename: shop.filename,
    tabCount: shop.tabs.length,
    productCount: shop.tabs.reduce((n, t) => n + t.products.length, 0),
    warnings,
  }
}
