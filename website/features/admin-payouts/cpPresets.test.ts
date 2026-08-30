import { describe, expect, it } from "vitest"

import {
  applyEconomyPreset,
  presetCpForPayout,
} from "@/features/admin-payouts/cpPresets"
import { DEFAULT_CP_PRESETS } from "@/lib/cp-presets-store"
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

const generous = {
  ...DEFAULT_CP_PRESETS.find((p) => p.id === "generous")!,
  sortOrder: 2,
}
const grindy = {
  ...DEFAULT_CP_PRESETS.find((p) => p.id === "grindy")!,
  sortOrder: 0,
}

describe("cpPresets", () => {
  it("maps B/S/G for generous", () => {
    expect(
      presetCpForPayout(
        item({
          id: "a",
          name: "A",
          difficulty: "bronze",
          mode: "normal",
        }),
        generous
      )
    ).toBe(50)
    expect(
      presetCpForPayout(
        item({ id: "b", name: "B", difficulty: "silver", mode: "normal" }),
        generous
      )
    ).toBe(120)
    expect(
      presetCpForPayout(
        item({ id: "c", name: "C", difficulty: "gold", mode: "normal" }),
        generous
      )
    ).toBe(250)
  })

  it("scales bearcat and diaspora", () => {
    expect(
      presetCpForPayout(
        item({
          id: "bc",
          name: "BC",
          difficulty: "bronze",
          mode: "bearcat",
        }),
        grindy
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
        grindy
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
      generous
    )
    expect(map["suginami-bronze"]).toBe(50)
  })
})
