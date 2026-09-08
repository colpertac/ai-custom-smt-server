import { describe, expect, it } from "vitest"

import {
  wikiClientBasicFeatures,
  wikiClientCharacteristics,
} from "./format"
import type { WikiItem } from "./types"

function sampleItem(): WikiItem {
  return {
    id: 29607,
    name: "Test",
    description: "",
    icon: 1,
    equipType: "EQUIP_TYPE_HEAD",
    equipSlot: "Head",
    weaponType: null,
    gender: 2,
    genderLabel: "Any",
    buyPrice: 0,
    sellPrice: 0,
    level: 0,
    durability: 1,
    stackSize: 1,
    setBonus: [
      "Close-range damage +5%",
      "Partner's Skill cooldown -5%",
    ],
    basicFeatures: [
      { id: "PDEF", label: "Phys defense", type: 0, value: 1 },
      { id: "CLSR", label: "Close-range", type: 0, value: 9 },
    ],
    characteristics: [
      { id: "COOLDOWN_TIME", label: "Skill cooldown", type: 1, value: -5 },
    ],
    stats: [],
  }
}

describe("wiki client feature buckets", () => {
  it("merges ItemData correctTbl into basic features", () => {
    const basic = wikiClientBasicFeatures(sampleItem())
    expect(basic.map((r) => r.id)).toEqual(["PDEF", "CLSR", "COOLDOWN_TIME"])
  })

  it("uses SItem tokusei lines as characteristics", () => {
    expect(wikiClientCharacteristics(sampleItem())).toEqual([
      "Close-range damage +5%",
      "Partner's Skill cooldown -5%",
    ])
  })
})
