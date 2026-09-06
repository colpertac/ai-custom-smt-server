import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

describe("store-prices-store", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-store-prices-"))
    process.env.WEBSITE_DATA_DIR = dataDir
  })

  afterEach(async () => {
    const mod = await import("./store-prices-store")
    mod.resetStorePricesStoreForTests()
    fs.rmSync(dataDir, { recursive: true, force: true })
    delete process.env.WEBSITE_DATA_DIR
  })

  it("returns default formula then persists edits", async () => {
    const {
      getStorePriceFormula,
      setStorePriceFormula,
      resetStorePricesStoreForTests,
    } = await import("./store-prices-store")
    resetStorePricesStoreForTests()

    const initial = getStorePriceFormula()
    expect(initial.minCp).toBe(1)

    const saved = setStorePriceFormula({
      ...initial,
      minCp: 3,
      weights: { ...initial.weights, CLSR: 1.5 },
    })
    expect(saved.minCp).toBe(3)
    expect(getStorePriceFormula().weights.CLSR).toBe(1.5)
  })

  it("upserts and deletes overrides", async () => {
    const {
      upsertStorePriceOverride,
      getStorePriceOverride,
      getStorePriceOverridesMap,
      deleteStorePriceOverride,
      listStorePriceOverrides,
      resetStorePricesStoreForTests,
    } = await import("./store-prices-store")
    resetStorePricesStoreForTests()

    upsertStorePriceOverride({ itemId: 10, cp: 99, note: "hot" })
    expect(getStorePriceOverride(10)?.cp).toBe(99)
    expect(getStorePriceOverridesMap([10, 11]).get(10)).toBe(99)
    expect(listStorePriceOverrides()).toHaveLength(1)
    expect(deleteStorePriceOverride(10)).toBe(true)
    expect(getStorePriceOverride(10)).toBeNull()
  })

  it("enforces order idempotency by clientOrderId", async () => {
    const { insertStoreOrder, resetStorePricesStoreForTests } = await import(
      "./store-prices-store"
    )
    resetStorePricesStoreForTests()

    const first = insertStoreOrder({
      clientOrderId: "ord-1",
      username: "Alice",
      itemIds: [1],
      productIds: [1],
      cpCharged: 10,
      outcome: "success",
    })
    expect(first.inserted).toBe(true)

    const second = insertStoreOrder({
      clientOrderId: "ord-1",
      username: "alice",
      itemIds: [1],
      productIds: [1],
      cpCharged: 10,
      outcome: "success",
    })
    expect(second.inserted).toBe(false)
    expect(second.existing?.username).toBe("alice")
    expect(second.existing?.outcome).toBe("success")
  })

  it("lists successful orders for a user newest first", async () => {
    const {
      insertStoreOrder,
      listStoreOrdersForUser,
      resetStorePricesStoreForTests,
    } = await import("./store-prices-store")
    resetStorePricesStoreForTests()

    insertStoreOrder({
      clientOrderId: "ord-a",
      username: "bob",
      itemIds: [1],
      productIds: [1],
      cpCharged: 3,
      outcome: "success",
    })
    insertStoreOrder({
      clientOrderId: "ord-b",
      username: "bob",
      itemIds: [2, 2],
      productIds: [2, 2],
      cpCharged: 8,
      outcome: "error",
      errorMessage: "Nope",
    })
    insertStoreOrder({
      clientOrderId: "ord-c",
      username: "bob",
      itemIds: [3],
      productIds: [3],
      cpCharged: 5,
      outcome: "replay",
    })

    const list = listStoreOrdersForUser("Bob", 10)
    expect(list.map((o) => o.clientOrderId)).toEqual(["ord-c", "ord-a"])
  })

  it("toggles cart feature flag (default on)", async () => {
    const {
      isStoreCartEnabled,
      setStoreCartEnabled,
      resetStorePricesStoreForTests,
    } = await import("./store-prices-store")
    resetStorePricesStoreForTests()

    expect(isStoreCartEnabled()).toBe(true)
    expect(setStoreCartEnabled(false)).toBe(false)
    expect(isStoreCartEnabled()).toBe(false)
    expect(setStoreCartEnabled(true)).toBe(true)
    expect(isStoreCartEnabled()).toBe(true)
  })
})
