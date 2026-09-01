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
const normal = {
  ...DEFAULT_CP_PRESETS.find((p) => p.id === "normal")!,
  sortOrder: 1,
}
const grindy = {
  ...DEFAULT_CP_PRESETS.find((p) => p.id === "grindy")!,
  sortOrder: 0,
}

describe("cpPresets", () => {
  it("uses per-dungeon sheet values for built-in presets", () => {
    expect(
      presetCpForPayout(
        item({
          id: "suginami-bronze",
          name: "Suginami (Bronze)",
          difficulty: "bronze",
          mode: "normal",
        }),
        grindy
      )
    ).toBe(3)
    expect(
      presetCpForPayout(
        item({
          id: "suginami-bronze",
          name: "Suginami (Bronze)",
          difficulty: "bronze",
          mode: "normal",
        }),
        normal
      )
    ).toBe(15)
    expect(
      presetCpForPayout(
        item({
          id: "mirage-ishtar",
          name: "Mirage (Ishtar)",
          difficulty: "special",
          mode: "boss",
          variantLabel: "True Ishtar",
        }),
        generous
      )
    ).toBe(500)
  })

  it("rounds fractional grindy values when scaled", () => {
    expect(
      presetCpForPayout(
        item({
          id: "suginami-unknown",
          name: "Suginami (?)",
          difficulty: "special",
          mode: "other",
        }),
        normal
      )
    ).toBe(13)
  })

  it("falls back to global tiers for unmapped dungeons", () => {
    expect(
      presetCpForPayout(
        item({
          id: "diaspora-suginami",
          name: "Diaspora Suginami",
          difficulty: "bronze",
          mode: "diaspora",
        }),
        grindy
      )
    ).toBe(120)
    expect(
      presetCpForPayout(
        item({
          id: "ice-cave",
          name: "Ice Cave",
          difficulty: "bronze",
          mode: "normal",
        }),
        generous
      )
    ).toBe(50)
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
        item({
          id: "zhuque-amaterasu-f",
          name: "Zhu Que (Amaterasu F)",
          difficulty: "special",
          mode: "boss",
        }),
      ],
      generous
    )
    expect(map["suginami-bronze"]).toBe(30)
    expect(map["zhuque-amaterasu-f"]).toBe(430)
  })
})
