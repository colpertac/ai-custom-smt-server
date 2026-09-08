import { describe, expect, it } from "vitest"

import {
  applyWeightedEconomy,
  familyWeightOf,
  presetTierBase,
  weightedCp,
} from "@/features/admin-payouts/payout-weights"
import type { EconomyPreset } from "@/lib/cp-presets-store"
import type { PayoutListItem } from "@/lib/dungeon-payout-types"

const preset: EconomyPreset = {
  id: "test",
  label: "Test",
  blurb: "",
  bronze: 10,
  silver: 20,
  gold: 40,
  bearcatMult: 1.5,
  diaspora: 100,
  bossMultOfGold: 1.25,
  special: 15,
  sortOrder: 0,
}

function item(
  partial: Partial<PayoutListItem> & Pick<PayoutListItem, "id" | "name">
): PayoutListItem {
  return {
    instanceId: 1,
    enabled: true,
    cp: 0,
    cpWeight: 1,
    crateDropCount: 0,
    clearItemCount: 0,
    filename: `${partial.id}.json`,
    ...partial,
  }
}

describe("familyWeightOf", () => {
  it("defaults missing keys to 1", () => {
    expect(familyWeightOf({}, "Suginami")).toBe(1)
    expect(familyWeightOf({ Suginami: 1.2 }, "Suginami")).toBe(1.2)
    expect(familyWeightOf({}, undefined)).toBe(1)
  })
})

describe("presetTierBase", () => {
  it("uses difficulty for normal mode", () => {
    expect(
      presetTierBase(item({ id: "a", name: "A", difficulty: "gold" }), preset)
    ).toBe(40)
    expect(
      presetTierBase(item({ id: "a", name: "A", difficulty: "silver" }), preset)
    ).toBe(20)
  })

  it("uses bearcat and boss multipliers", () => {
    expect(
      presetTierBase(
        item({ id: "a", name: "A", mode: "bearcat", difficulty: "bronze" }),
        preset
      )
    ).toBe(15)
    expect(
      presetTierBase(item({ id: "a", name: "A", mode: "boss" }), preset)
    ).toBe(50)
  })

  it("uses diaspora and special", () => {
    expect(
      presetTierBase(item({ id: "a", name: "A", mode: "diaspora" }), preset)
    ).toBe(100)
    expect(
      presetTierBase(
        item({ id: "a", name: "A", difficulty: "special" }),
        preset
      )
    ).toBe(15)
  })
})

describe("weightedCp", () => {
  it("multiplies base × family × payout and rounds", () => {
    const gold = item({ id: "g", name: "G", difficulty: "gold", cpWeight: 1 })
    expect(weightedCp(gold, preset, 1.2, 1)).toBe(48)
    expect(weightedCp(gold, preset, 1.2, 1.5)).toBe(72)
  })

  it("returns 0 when any weight is 0", () => {
    const bronze = item({ id: "b", name: "B", difficulty: "bronze" })
    expect(weightedCp(bronze, preset, 0, 1)).toBe(0)
    expect(weightedCp(bronze, preset, 1, 0)).toBe(0)
  })

  it("rounds fractional products", () => {
    const bronze = item({ id: "b", name: "B", difficulty: "bronze" })
    // 10 × 1.15 × 1.1 = 12.65 → 13
    expect(weightedCp(bronze, preset, 1.15, 1.1)).toBe(13)
  })
})

describe("applyWeightedEconomy", () => {
  it("applies family and per-payout weights", () => {
    const list = [
      item({
        id: "suginami-bronze",
        name: "Sug B",
        family: "Suginami",
        difficulty: "bronze",
        cpWeight: 1,
      }),
      item({
        id: "suginami-bearcat",
        name: "Sug Bear",
        family: "Suginami",
        mode: "bearcat",
        difficulty: "bronze",
        cpWeight: 2,
      }),
      item({
        id: "celu-gold",
        name: "Celu G",
        family: "Celu",
        difficulty: "gold",
        cpWeight: 1,
      }),
    ]
    const map = applyWeightedEconomy(list, preset, { Suginami: 1.5 })
    expect(map["suginami-bronze"]).toBe(15) // 10 × 1.5 × 1
    expect(map["suginami-bearcat"]).toBe(45) // 15 × 1.5 × 2
    expect(map["celu-gold"]).toBe(40) // 40 × 1 × 1
  })
})
