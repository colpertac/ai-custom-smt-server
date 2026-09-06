import { describe, expect, it } from "vitest"

import type { WikiItem } from "@/content/wiki/types"
import {
  computeFormulaBreakdown,
  DEFAULT_STORE_PRICE_FORMULA,
  normalizeStorePriceFormula,
  resolveStorePrice,
} from "./store-pricing"

function stubItem(partial: Partial<WikiItem> & { id: number }): WikiItem {
  return {
    name: "Test",
    description: "",
    icon: 0,
    equipType: "EQUIP_TYPE_WEAPON",
    equipSlot: "weapon",
    weaponType: "SWORD",
    gender: 2,
    genderLabel: "Any",
    buyPrice: 0,
    sellPrice: 0,
    level: 0,
    durability: 0,
    stackSize: 1,
    stats: [],
    ...partial,
  }
}

describe("normalizeStorePriceFormula", () => {
  it("fills defaults and clamps max >= min", () => {
    const f = normalizeStorePriceFormula({ minCp: 10, maxCp: 5 })
    expect(f.minCp).toBe(10)
    expect(f.maxCp).toBe(10)
    expect(f.weights.LB_CHANCE).toBe(DEFAULT_STORE_PRICE_FORMULA.weights.LB_CHANCE)
  })

  it("merges custom weights", () => {
    const f = normalizeStorePriceFormula({
      weights: { CLSR: 9, CUSTOM_STAT: 3 },
    })
    expect(f.weights.CLSR).toBe(9)
    expect(f.weights.CUSTOM_STAT).toBe(3)
    expect(f.weights.LB_DAMAGE).toBe(DEFAULT_STORE_PRICE_FORMULA.weights.LB_DAMAGE)
  })
})

describe("computeFormulaBreakdown", () => {
  it("prices weapons from category + combat stats", () => {
    const item = stubItem({
      id: 1201,
      level: 10,
      basicFeatures: [
        { id: "CLSR", label: "Close-range", type: 0, value: 100 },
        { id: "LB_CHANCE", label: "LB chance", type: 0, value: 20 },
      ],
    })
    const breakdown = computeFormulaBreakdown(item, DEFAULT_STORE_PRICE_FORMULA)
    expect(breakdown.category).toBe("weapons")
    // 25 + 10*0.5 + 100*0.8 + 20*2.5 = 25 + 5 + 80 + 50 = 160
    expect(breakdown.raw).toBe(160)
    expect(breakdown.clamped).toBe(160)
    expect(breakdown.terms.some((t) => t.id === "LB_CHANCE")).toBe(true)
  })

  it("clamps to minCp", () => {
    const item = stubItem({
      id: 1,
      equipType: "EQUIP_TYPE_NONE",
      equipSlot: "none",
      level: 0,
    })
    const formula = normalizeStorePriceFormula({
      minCp: 7,
      categoryBase: { weapons: 0, armor: 0, items: 0 },
      levelWeight: 0,
      weights: {},
    })
    expect(computeFormulaBreakdown(item, formula).clamped).toBe(7)
  })
})

describe("resolveStorePrice", () => {
  it("prefers override over formula", () => {
    const item = stubItem({
      id: 99,
      basicFeatures: [{ id: "CLSR", label: "Close-range", type: 0, value: 999 }],
    })
    const resolved = resolveStorePrice(item, DEFAULT_STORE_PRICE_FORMULA, 42)
    expect(resolved).toEqual({
      itemId: 99,
      cp: 42,
      source: "override",
      breakdown: null,
    })
  })

  it("uses formula when override is null", () => {
    const item = stubItem({ id: 5, level: 0 })
    const resolved = resolveStorePrice(item, DEFAULT_STORE_PRICE_FORMULA, null)
    expect(resolved.source).toBe("formula")
    expect(resolved.cp).toBeGreaterThanOrEqual(DEFAULT_STORE_PRICE_FORMULA.minCp)
  })
})
