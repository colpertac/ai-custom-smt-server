import { describe, expect, it } from "vitest"

import {
  groupPayoutsByFamily,
  variantDisplayLabel,
} from "@/features/admin-payouts/groupPayouts"
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

describe("groupPayoutsByFamily", () => {
  it("places normal B/S/G in columns and bearcat under variants", () => {
    const rows = groupPayoutsByFamily([
      item({
        id: "suginami-bronze",
        name: "Suginami (Bronze)",
        family: "Suginami Tunnels",
        difficulty: "bronze",
        mode: "normal",
        cp: 10,
        enabled: true,
      }),
      item({
        id: "suginami-silver",
        name: "Suginami (Silver)",
        family: "Suginami Tunnels",
        difficulty: "silver",
        mode: "normal",
        cp: 9,
      }),
      item({
        id: "suginami-bronze-bearcat",
        name: "Suginami (Bronze, Bearcat)",
        family: "Suginami Tunnels",
        difficulty: "bronze",
        mode: "bearcat",
        variantLabel: "Bearcat",
        cp: 14,
      }),
      item({
        id: "celu-gold",
        name: "Celu (Gold)",
        family: "Celu Tower",
        difficulty: "gold",
        mode: "normal",
        cp: 47,
      }),
    ])

    expect(rows).toHaveLength(2)
    expect(rows[0].family).toBe("Celu Tower")
    expect(rows[0].gold?.cp).toBe(47)
    expect(rows[1].family).toBe("Suginami Tunnels")
    expect(rows[1].bronze?.id).toBe("suginami-bronze")
    expect(rows[1].silver?.id).toBe("suginami-silver")
    expect(rows[1].gold).toBeUndefined()
    expect(rows[1].variants).toHaveLength(1)
    expect(rows[1].variants[0].id).toBe("suginami-bronze-bearcat")
  })

  it("variantDisplayLabel prefers variantLabel", () => {
    expect(
      variantDisplayLabel(
        item({
          id: "x",
          name: "Foo (Bar)",
          variantLabel: "Amaterasu ♀",
        })
      )
    ).toBe("Amaterasu ♀")
  })
})
