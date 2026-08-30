import { describe, expect, it } from "vitest"

import {
  applyEconomyPreset,
  ECONOMY_PRESETS,
  presetCpForPayout,
} from "@/features/admin-payouts/cpPresets"
import type { PayoutListItem } from "@/lib/dungeon-payout-types"

function item(
  partial: Partial<PayoutListItem> & Pick<PayoutListItem, "id" | "name">
): PayoutListItem {
  return {
    instanceId: 1,
    enabled: false,
    cp: 0,
    crateDropCount: 0,
    clearItemCount: 0,
    filename: `${partial.id}.json`,
    ...partial,
  }
}

describe("cpPresets", () => {
  it("maps B/S/G for generous", () => {
    const g = ECONOMY_PRESETS.generous
    expect(
      presetCpForPayout(
        item({
          id: "a",
          name: "A",
          difficulty: "bronze",
          mode: "normal",
        }),
        g
      )
    ).toBe(50)
    expect(
      presetCpForPayout(
        item({ id: "b", name: "B", difficulty: "silver", mode: "normal" }),
        g
      )
    ).toBe(120)
    expect(
      presetCpForPayout(
        item({ id: "c", name: "C", difficulty: "gold", mode: "normal" }),
        g
      )
    ).toBe(250)
  })

  it("scales bearcat and diaspora", () => {
    const grind = ECONOMY_PRESETS.grindy
    expect(
      presetCpForPayout(
        item({
          id: "bc",
          name: "BC",
          difficulty: "bronze",
          mode: "bearcat",
        }),
        grind
      )
    ).toBe(8)
    expect(
      presetCpForPayout(
        item({
          id: "di",
          name: "Di",
          difficulty: "bronze",
          mode: "diaspora",
        }),
        grind
      )
    ).toBe(120)
  })

  it("applyEconomyPreset fills all ids", () => {
    const map = applyEconomyPreset(
      [
        item({
          id: "suginami-bronze",
          name: "S",
          difficulty: "bronze",
          mode: "normal",
        }),
      ],
      "generous"
    )
    expect(map["suginami-bronze"]).toBe(50)
  })
})
