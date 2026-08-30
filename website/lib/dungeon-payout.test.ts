import { describe, expect, it } from "vitest"

import {
  generateDropSetXml,
  generateEventsXml,
} from "@/lib/dungeon-payout-generate"
import { putPayoutSchema } from "@/lib/dungeon-payout-schema"
import type { DungeonPayout } from "@/lib/dungeon-payout-types"
import suginami from "../../server-content/payouts/suginami-bronze.json"

const payout = (suginami as { payout: DungeonPayout }).payout

describe("dungeon payout schema", () => {
  it("accepts seeded suginami-bronze", () => {
    const parsed = putPayoutSchema.safeParse(suginami)
    expect(parsed.success).toBe(true)
  })

  it("rejects duplicate crate item ids", () => {
    const bad = {
      version: 1 as const,
      payout: {
        ...payout,
        crateDrops: [
          { itemId: 1, minStack: 1, maxStack: 1, rate: 10 },
          { itemId: 1, minStack: 1, maxStack: 1, rate: 20 },
        ],
      },
    }
    expect(putPayoutSchema.safeParse(bad).success).toBe(false)
  })
})

describe("dungeon payout generate", () => {
  it("emits DropSet id and crate rates", () => {
    const xml = generateDropSetXml(payout)
    expect(xml).toContain('<member name="ID">900003</member>')
    expect(xml).toContain('<member name="ItemType">699</member>')
    expect(xml).toContain('<member name="MutexID">1</member>')
  })

  it("emits CP and instance gate", () => {
    const xml = generateEventsXml(payout)
    expect(xml).toContain('<member name="value">10</member>')
    expect(xml).toContain("<element>5401</element>")
    expect(xml).toContain("AI_P13_5401_CLEAR_BONUS")
  })

  it("emits clear items when present", () => {
    const withApple: DungeonPayout = {
      ...payout,
      clearItems: [{ itemId: 21941, quantity: 2 }],
    }
    const xml = generateEventsXml(withApple)
    expect(xml).toContain("ActionAddRemoveItems")
    expect(xml).toContain("<key>21941</key>")
    expect(xml).toContain("<value>2</value>")
  })
})
