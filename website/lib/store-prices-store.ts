import fs from "node:fs"
import path from "node:path"

import { DatabaseSync } from "./node-sqlite.ts"
import {
  DEFAULT_STORE_PRICE_FORMULA,
  normalizeStorePriceFormula,
  type StorePriceFormula,
} from "./store-pricing.ts"

function dbPath(): string {
  const custom = process.env.WEBSITE_DATA_DIR?.trim()
  const dir = custom || path.join(process.cwd(), "data")
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, "web.sqlite")
}

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (db) return db
  db = new DatabaseSync(dbPath())
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS store_price_overrides (
      item_id INTEGER PRIMARY KEY,
      cp INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS store_orders (
      client_order_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      item_ids TEXT NOT NULL,
      product_ids TEXT NOT NULL,
      cp_charged INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      error_message TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_store_orders_username
      ON store_orders(username);
  `)
  return db
}

const FORMULA_KEY = "store_price_formula"
const CART_ENABLED_KEY = "store_cart_enabled"

export type StorePriceOverride = {
  itemId: number
  cp: number
  note: string
  updatedAt: number
}

export type StoreOrderRecord = {
  clientOrderId: string
  username: string
  itemIds: number[]
  productIds: number[]
  cpCharged: number
  outcome: "success" | "error" | "replay"
  errorMessage: string | null
  createdAt: number
}

export function getStorePriceFormula(): StorePriceFormula {
  const row = getDb()
    .prepare("SELECT value FROM site_settings WHERE key = ?")
    .get(FORMULA_KEY) as { value: string } | undefined
  if (!row?.value) return { ...DEFAULT_STORE_PRICE_FORMULA, weights: { ...DEFAULT_STORE_PRICE_FORMULA.weights }, categoryBase: { ...DEFAULT_STORE_PRICE_FORMULA.categoryBase } }
  try {
    return normalizeStorePriceFormula(JSON.parse(row.value) as Partial<StorePriceFormula>)
  } catch {
    return normalizeStorePriceFormula(null)
  }
}

/** Player-facing wiki cart / checkout. Default on until admin disables. */
export function isStoreCartEnabled(): boolean {
  const row = getDb()
    .prepare("SELECT value FROM site_settings WHERE key = ?")
    .get(CART_ENABLED_KEY) as { value: string } | undefined
  if (!row?.value) return true
  return row.value === "1" || row.value.toLowerCase() === "true"
}

export function setStoreCartEnabled(enabled: boolean): boolean {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(CART_ENABLED_KEY, enabled ? "1" : "0", now)
  return enabled
}

export function setStorePriceFormula(formula: StorePriceFormula): StorePriceFormula {
  const normalized = normalizeStorePriceFormula(formula)
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(FORMULA_KEY, JSON.stringify(normalized), now)
  return normalized
}

export function listStorePriceOverrides(): StorePriceOverride[] {
  const rows = getDb()
    .prepare(
      `SELECT item_id, cp, note, updated_at FROM store_price_overrides
       ORDER BY item_id ASC`
    )
    .all() as { item_id: number; cp: number; note: string; updated_at: number }[]
  return rows.map((r) => ({
    itemId: r.item_id,
    cp: r.cp,
    note: r.note ?? "",
    updatedAt: r.updated_at,
  }))
}

export function getStorePriceOverride(itemId: number): StorePriceOverride | null {
  const row = getDb()
    .prepare(
      `SELECT item_id, cp, note, updated_at FROM store_price_overrides WHERE item_id = ?`
    )
    .get(itemId) as
    | { item_id: number; cp: number; note: string; updated_at: number }
    | undefined
  if (!row) return null
  return {
    itemId: row.item_id,
    cp: row.cp,
    note: row.note ?? "",
    updatedAt: row.updated_at,
  }
}

export function getStorePriceOverridesMap(
  itemIds: number[]
): Map<number, number> {
  const map = new Map<number, number>()
  if (itemIds.length === 0) return map
  const unique = [...new Set(itemIds.filter((n) => Number.isInteger(n) && n > 0))]
  if (unique.length === 0) return map

  const placeholders = unique.map(() => "?").join(",")
  const rows = getDb()
    .prepare(
      `SELECT item_id, cp FROM store_price_overrides WHERE item_id IN (${placeholders})`
    )
    .all(...unique) as { item_id: number; cp: number }[]
  for (const row of rows) {
    map.set(row.item_id, row.cp)
  }
  return map
}

export function upsertStorePriceOverride(input: {
  itemId: number
  cp: number
  note?: string
}): StorePriceOverride {
  const itemId = Math.floor(input.itemId)
  const cp = Math.floor(input.cp)
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new Error("itemId must be a positive integer")
  }
  if (!Number.isInteger(cp) || cp < 0) {
    throw new Error("cp must be a non-negative integer")
  }
  const note = (input.note ?? "").trim().slice(0, 500)
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO store_price_overrides (item_id, cp, note, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET
         cp = excluded.cp,
         note = excluded.note,
         updated_at = excluded.updated_at`
    )
    .run(itemId, cp, note, now)
  return { itemId, cp, note, updatedAt: now }
}

export function deleteStorePriceOverride(itemId: number): boolean {
  const result = getDb()
    .prepare(`DELETE FROM store_price_overrides WHERE item_id = ?`)
    .run(itemId)
  return Number(result.changes ?? 0) > 0
}

export function findStoreOrder(
  clientOrderId: string
): StoreOrderRecord | null {
  const row = getDb()
    .prepare(
      `SELECT client_order_id, username, item_ids, product_ids, cp_charged,
              outcome, error_message, created_at
       FROM store_orders WHERE client_order_id = ?`
    )
    .get(clientOrderId) as
    | {
        client_order_id: string
        username: string
        item_ids: string
        product_ids: string
        cp_charged: number
        outcome: string
        error_message: string | null
        created_at: number
      }
    | undefined
  if (!row) return null
  return {
    clientOrderId: row.client_order_id,
    username: row.username,
    itemIds: JSON.parse(row.item_ids) as number[],
    productIds: JSON.parse(row.product_ids) as number[],
    cpCharged: row.cp_charged,
    outcome: row.outcome as StoreOrderRecord["outcome"],
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }
}

export function insertStoreOrder(order: {
  clientOrderId: string
  username: string
  itemIds: number[]
  productIds: number[]
  cpCharged: number
  outcome: StoreOrderRecord["outcome"]
  errorMessage?: string | null
}): { inserted: boolean; existing: StoreOrderRecord | null } {
  const existing = findStoreOrder(order.clientOrderId)
  if (existing) {
    return { inserted: false, existing }
  }
  const now = Date.now()
  try {
    getDb()
      .prepare(
        `INSERT INTO store_orders
          (client_order_id, username, item_ids, product_ids, cp_charged, outcome, error_message, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        order.clientOrderId,
        order.username.toLowerCase(),
        JSON.stringify(order.itemIds),
        JSON.stringify(order.productIds),
        order.cpCharged,
        order.outcome,
        order.errorMessage ?? null,
        now
      )
    return { inserted: true, existing: null }
  } catch {
    // Race: another insert won — return existing
    return { inserted: false, existing: findStoreOrder(order.clientOrderId) }
  }
}

/** Recent successful purchases for a logged-in player (newest first). */
export function listStoreOrdersForUser(
  username: string,
  limit = 20
): StoreOrderRecord[] {
  const normalized = username.toLowerCase()
  const capped = Math.min(50, Math.max(1, Math.floor(limit)))
  const rows = getDb()
    .prepare(
      `SELECT client_order_id, username, item_ids, product_ids, cp_charged,
              outcome, error_message, created_at
       FROM store_orders
       WHERE username = ? AND outcome IN ('success', 'replay')
       ORDER BY created_at DESC, rowid DESC
       LIMIT ?`
    )
    .all(normalized, capped) as {
    client_order_id: string
    username: string
    item_ids: string
    product_ids: string
    cp_charged: number
    outcome: string
    error_message: string | null
    created_at: number
  }[]

  return rows.map((row) => ({
    clientOrderId: row.client_order_id,
    username: row.username,
    itemIds: JSON.parse(row.item_ids) as number[],
    productIds: JSON.parse(row.product_ids) as number[],
    cpCharged: row.cp_charged,
    outcome: row.outcome as StoreOrderRecord["outcome"],
    errorMessage: row.error_message,
    createdAt: row.created_at,
  }))
}

/** Test helper — close DB handle and clear memo. */
export function resetStorePricesStoreForTests(): void {
  if (db) {
    try {
      db.close()
    } catch {
      /* ignore */
    }
  }
  db = null
}
