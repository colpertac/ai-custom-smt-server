import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CompAuthState } from "./comp-api"

describe("store-checkout", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-checkout-"))
    process.env.WEBSITE_DATA_DIR = dataDir
  })

  afterEach(async () => {
    const mod = await import("./store-prices-store")
    mod.resetStorePricesStoreForTests()
    fs.rmSync(dataDir, { recursive: true, force: true })
    delete process.env.WEBSITE_DATA_DIR
    vi.restoreAllMocks()
  })

  it("rejects empty cart", async () => {
    const { checkoutStoreCart } = await import("./store-checkout")
    const { resetStorePricesStoreForTests } = await import(
      "./store-prices-store"
    )
    resetStorePricesStoreForTests()

    const result = await checkoutStoreCart({
      username: "alice",
      clientOrderId: "order-abc-1",
      lines: [],
      authenticate: async () =>
        ({ username: "admin", passwordHash: "x", challenge: "y" }) as CompAuthState,
      postItems: async () => ({ error: "Success", cp: 0 }),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe("EMPTY_CART")
  })

  it("is idempotent on successful clientOrderId replay", async () => {
    const { checkoutStoreCart } = await import("./store-checkout")
    const { resetStorePricesStoreForTests, insertStoreOrder } = await import(
      "./store-prices-store"
    )
    resetStorePricesStoreForTests()

    insertStoreOrder({
      clientOrderId: "order-replay-1",
      username: "alice",
      itemIds: [1],
      productIds: [1],
      cpCharged: 5,
      outcome: "success",
    })

    const postItems = vi.fn(async () => ({ error: "Success", cp: 95 }))
    const result = await checkoutStoreCart({
      username: "alice",
      clientOrderId: "order-replay-1",
      lines: [{ itemId: 1, qty: 1 }],
      authenticate: async () =>
        ({ username: "admin", passwordHash: "x", challenge: "y" }) as CompAuthState,
      postItems,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.replay).toBe(true)
      expect(result.cpCharged).toBe(5)
    }
    expect(postItems).not.toHaveBeenCalled()
  })
})
