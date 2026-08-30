import { describe, expect, it } from "vitest"

import {
  getWikiItemCategory,
  listWikiItems,
  type WikiItem,
} from "@/content/wiki"

function stub(partial: Partial<WikiItem> & Pick<WikiItem, "id" | "equipType">): WikiItem {
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

describe("listWikiItems sample buckets", () => {
  it("splits the prototype sample across three categories", () => {
    expect(listWikiItems("weapons").every((i) => i.equipType.includes("WEAPON"))).toBe(
      true
    )
    expect(listWikiItems("armor").length).toBeGreaterThan(0)
    expect(listWikiItems("items").length).toBeGreaterThan(0)
  })
})
