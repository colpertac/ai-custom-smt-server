import { describe, expect, it } from "vitest"

import {
  applyShopSlotRemapToList,
  planShopSlotRemap,
} from "./comp-shop-order.ts"
import { mergeShopOrder } from "./comp-shops-fs.ts"

describe("mergeShopOrder", () => {
  it("keeps saved order and appends new ids ascending", () => {
    expect(mergeShopOrder([640, 301], [301, 327, 640])).toEqual([
      640, 301, 327,
    ])
  })

  it("drops deleted ids from saved order", () => {
    expect(mergeShopOrder([301, 999, 640], [640, 301])).toEqual([301, 640])
  })

  it("falls back to ascending shop ids when no saved order", () => {
    expect(mergeShopOrder([], [640, 301, 327])).toEqual([301, 327, 640])
  })
})

describe("planShopSlotRemap", () => {
  it("keeps slot ids and remaps moved content", () => {
    // slots: 6001, 6002, 6003 — move 6001 content to end
    const remap = planShopSlotRemap(
      [6001, 6002, 6003],
      [6002, 6003, 6001]
    )
    expect(Object.fromEntries(remap)).toEqual({
      6002: 6001,
      6003: 6002,
      6001: 6003,
    })
  })

  it("is identity when order unchanged", () => {
    const remap = planShopSlotRemap([1, 2, 3], [1, 2, 3])
    expect([...remap.entries()].every(([f, t]) => f === t)).toBe(true)
  })
})

describe("applyShopSlotRemapToList", () => {
  it("rewrites shopId/filename for landing slots", () => {
    const shops = [
      { shopId: 6001, filename: "compshop-6001.xml", name: "DCO" },
      { shopId: 6002, filename: "compshop-6002.xml", name: "Armor" },
      { shopId: 6003, filename: "compshop-6003.xml", name: "Weapon" },
    ]
    const next = applyShopSlotRemapToList(shops, [6002, 6003, 6001])
    expect(next.map((s) => [s.shopId, s.name])).toEqual([
      [6001, "Armor"],
      [6002, "Weapon"],
      [6003, "DCO"],
    ])
    expect(next.map((s) => s.filename)).toEqual([
      "compshop-6001.xml",
      "compshop-6002.xml",
      "compshop-6003.xml",
    ])
  })
})
