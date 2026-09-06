import { describe, expect, it } from "vitest"

import {
  getActiveEventIdsFromChannel,
  getEventsAdminStatus,
  getEventsCatalog,
  updateActiveEvents,
} from "./events-fs"

describe("events-fs", () => {
  it("loads events catalog with valid schema", async () => {
    const catalog = await getEventsCatalog()
    expect(catalog.version).toBe(1)
    expect(catalog.events.length).toBeGreaterThan(50)

    const pieEvent = catalog.events.find((e) => e.id === "201510_halloween")
    expect(pieEvent).toBeDefined()
    expect(pieEvent?.titleJp).toBe("パイは投げられた")
    expect(pieEvent?.titleEn).toContain("Pie Was Thrown")
    expect(pieEvent?.category).toBe("halloween")
    expect(pieEvent?.summary).toContain("cream pie")
    expect(pieEvent?.featuredNpcs.some((n) => /[\u3040-\u30ff]/.test(n))).toBe(
      false
    )
    expect(pieEvent?.featuredNpcs).toEqual(
      expect.arrayContaining(["Nekomata", "Alice", "Mada", "Yagiya"])
    )
    expect(pieEvent?.npcSpawns?.length).toBeGreaterThan(0)
    const nekoShibuya = pieEvent?.npcSpawns?.find(
      (s) => s.name === "Nekomata" && s.zoneId === 70101
    )
    expect(nekoShibuya?.x).toBeCloseTo(-8661.5, 0)
    expect(nekoShibuya?.y).toBeCloseTo(38264.6, 0)
    const nekoSuginami = pieEvent?.npcSpawns?.find(
      (s) => s.name === "Nekomata" && s.zoneId === 30101
    )
    expect(nekoSuginami?.x).toBeCloseTo(-41630.3, 0)
    expect(nekoSuginami?.y).toBeCloseTo(8926.7, 0)
    expect(pieEvent?.affectedZones.some((z) => /Halloween Party|241001/.test(z))).toBe(
      true
    )
    expect(pieEvent?.affectedZones.some((z) => /Pie-Throwing|1131601/.test(z))).toBe(
      true
    )
  })

  it("retrieves current events status from channel.xml", async () => {
    const status = await getEventsAdminStatus()
    expect(status.events.length).toBeGreaterThan(50)
    expect(typeof status.activeCount).toBe("number")
    expect(typeof status.isDirty).toBe("boolean")
    expect(status.workingXmlPath).toContain("channel.xml")
  })

  it("toggles an event in channel.xml and restores state", async () => {
    const before = await getActiveEventIdsFromChannel()
    const initialActive = Array.from(before.activeIds)

    // Add 201510_halloween
    const withHalloween = Array.from(new Set([...initialActive, "201510_halloween"]))
    const resAdd = await updateActiveEvents(withHalloween)
    expect(resAdd.success).toBe(true)
    expect(resAdd.activeIds).toContain("201510_halloween")

    const verifyAdd = await getActiveEventIdsFromChannel()
    expect(verifyAdd.activeIds.has("201510_halloween")).toBe(true)

    // Restore original active set
    const resRestore = await updateActiveEvents(initialActive)
    expect(resRestore.success).toBe(true)
    expect(resRestore.activeIds).toEqual(initialActive)

    const verifyRestore = await getActiveEventIdsFromChannel()
    expect(verifyRestore.activeIds.has("201510_halloween")).toBe(
      initialActive.includes("201510_halloween")
    )
  })
})
