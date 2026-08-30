import { describe, expect, it } from "vitest"

import {
  generateBonusOnlyEventsXml,
  generateDropSetXml,
  generateEventsXml,
  generateSharedAfterEventsXml,
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
    expect(xml).toContain(`<member name="ID">${payout.dropSetId}</member>`)
    expect(xml).toContain('<member name="ItemType">699</member>')
    expect(xml).toContain('<member name="MutexID">1</member>')
  })

  it("emits CP and instance gate", () => {
    const xml = generateEventsXml(payout)
    expect(xml).toContain(`<member name="value">${payout.cp}</member>`)
    expect(xml).toContain("<element>5401</element>")
    expect(xml).toContain(payout.hooks.bonusEventId)
    expect(xml).toContain('<member name="sourceContext">ALL</member>')
    expect(xml).toContain('<member name="stopOnFailure">false</member>')
    const cpIdx = xml.indexOf("ActionUpdatePoints")
    const lootIdx = xml.indexOf("ActionCreateLoot")
    expect(cpIdx).toBeGreaterThan(-1)
    expect(lootIdx).toBeGreaterThan(-1)
    expect(cpIdx).toBeLessThan(lootIdx)
  })

  it("merges shared AFTER branches for a family", () => {
    const silver: DungeonPayout = {
      ...payout,
      id: "suginami-silver",
      instanceId: 5402,
      hooks: {
        ...payout.hooks,
        bonusEventId: "AI_PAY_SUGINAMI_SILVER_BONUS",
        bonusFiendEventId: "AI_PAY_SUGINAMI_SILVER_BONUS_FIEND",
      },
    }
    const shared = generateSharedAfterEventsXml([payout, silver])
    expect(shared).toContain(payout.hooks.afterNormalLootEventId)
    expect(shared).toContain("<element>5401</element>")
    expect(shared).toContain("<element>5402</element>")
    expect(shared).toContain(payout.hooks.bonusEventId)
    expect(shared).toContain("AI_PAY_SUGINAMI_SILVER_BONUS")
    expect(shared).not.toContain("EventPerformActions")
    const bonus = generateBonusOnlyEventsXml(payout)
    expect(bonus).toContain("EventPerformActions")
    expect(bonus).not.toContain(payout.hooks.afterNormalLootEventId)
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
