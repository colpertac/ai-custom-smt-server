import { describe, expect, it } from "vitest"

import { buildItemToProductMapForTests } from "./store-product-map"

describe("store-product-map", () => {
  it("prefers stack 1 then productId === itemId", () => {
    const map = buildItemToProductMapForTests({
      "5001": { itemId: 100, stack: 5, isCp: false, name: "stack5" },
      "100": { itemId: 100, stack: 1, isCp: false, name: "exact" },
      "5002": { itemId: 100, stack: 1, isCp: true, name: "other-stack1" },
    })
    expect(map.get(100)).toMatchObject({
      productId: 100,
      itemId: 100,
      stack: 1,
      name: "exact",
    })
  })

  it("falls back to lowest stack-1 productId", () => {
    const map = buildItemToProductMapForTests({
      "200": { itemId: 50, stack: 1, isCp: false },
      "150": { itemId: 50, stack: 1, isCp: false },
    })
    expect(map.get(50)?.productId).toBe(150)
  })
})
