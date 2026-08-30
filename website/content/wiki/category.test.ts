import { describe, expect, it } from "vitest"

import {
  getWikiItemCategory,
  searchWikiCatalog,
  type WikiItem,
} from "@/content/wiki"

function stub(
  partial: Partial<WikiItem> & Pick<WikiItem, "id" | "equipType">
): WikiItem {
  return {
    name: "x",
    description: "",
    icon: 0,
    equipSlot: "",
    weaponType: null,
    gender: 2,
    genderLabel: "Any",
    buyPrice: 0,
    sellPrice: 0,
    level: 0,
    durability: 0,
    stackSize: 0,
    stats: [],
    ...partial,
  }
}

describe("getWikiItemCategory", () => {
  it("puts WEAPON slot in weapons", () => {
    expect(
      getWikiItemCategory(stub({ id: 1, equipType: "EQUIP_TYPE_WEAPON" }))
    ).toBe("weapons")
  })

  it("puts wearable slots in armor", () => {
    expect(
      getWikiItemCategory(stub({ id: 1, equipType: "EQUIP_TYPE_HEAD" }))
    ).toBe("armor")
    expect(
      getWikiItemCategory(stub({ id: 1, equipType: "EQUIP_TYPE_TOP" }))
    ).toBe("armor")
    expect(
      getWikiItemCategory(stub({ id: 1, equipType: "EQUIP_TYPE_RING" }))
    ).toBe("armor")
  })

  it("puts NONE / unknown in items", () => {
    expect(
      getWikiItemCategory(stub({ id: 1, equipType: "EQUIP_TYPE_NONE" }))
    ).toBe("items")
  })
})

describe("searchWikiCatalog", () => {
  it("filters by name and caps results", () => {
    const { total, items } = searchWikiCatalog("ointment", {
      category: "items",
      limit: 5,
    })
    expect(total).toBeGreaterThan(0)
    expect(items.length).toBeLessThanOrEqual(5)
    expect(items.every((i) => i.name.toLowerCase().includes("ointment"))).toBe(
      true
    )
  })

  it("paginates with offset", () => {
    const page0 = searchWikiCatalog("", { category: "weapons", limit: 10, offset: 0 })
    const page1 = searchWikiCatalog("", { category: "weapons", limit: 10, offset: 10 })
    expect(page0.items.length).toBe(10)
    expect(page1.items.length).toBe(10)
    expect(page0.items[0]?.id).not.toBe(page1.items[0]?.id)
  })
})
