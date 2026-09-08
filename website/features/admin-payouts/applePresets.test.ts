import { describe, expect, it } from "vitest"

import {
  applyApplePreset,
  applyWeightedApples,
  weightedApples,
} from "@/features/admin-payouts/applePresets"
import type { PayoutListItem } from "@/lib/dungeon-payout-types"

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

describe("applePresets", () => {
  it("scales suginami bronze grindy → normal → generous", () => {
    const rows = [
      item({
        id: "suginami-bronze",
        name: "Sug B",
        family: "Suginami Tunnels",
      }),
    ]
    expect(applyApplePreset(rows, "grindy")["suginami-bronze"]).toBe(15)
    expect(applyApplePreset(rows, "normal")["suginami-bronze"]).toBe(75)
    expect(applyApplePreset(rows, "generous")["suginami-bronze"]).toBe(150)
  })

  it("applies family × payout weight on grindy base", () => {
    const row = item({
      id: "suginami-bronze",
      name: "Sug B",
      family: "Suginami Tunnels",
      cpWeight: 2,
    })
    expect(weightedApples(row, 1.5, 2)).toBe(45)
    const map = applyWeightedApples([row], { "Suginami Tunnels": 1.5 })
    expect(map["suginami-bronze"]).toBe(45)
  })
})
