import { describe, expect, it } from "vitest"

import {
  computeArmoryTotalStats,
  computeDisabledExpertiseSkills,
  decodeLearnedSkillIds,
} from "@/lib/armory-stats"
import type { ArmoryEquipmentSlot, ArmoryStats } from "@/lib/armory"

const emptyBase: ArmoryStats = {
  level: 99,
  xp: 0,
  hp: 1000,
  mp: 500,
  maxHp: 1000,
  maxMp: 500,
  str: 50,
  magic: 99,
  vit: 40,
  intel: 30,
  speed: 35,
  luck: 20,
  clsr: 10,
  lngr: 10,
  spell: 10,
  support: 10,
  pdef: 10,
  mdef: 10,
}

describe("decodeLearnedSkillIds", () => {
  it("decodes u32 count prefix + skill ids", () => {
    const buf = Buffer.alloc(12)
    buf.writeUInt32LE(2, 0)
    buf.writeUInt32LE(5801, 4)
    buf.writeUInt32LE(5802, 8)
    expect(decodeLearnedSkillIds(buf)).toEqual([5801, 5802])
  })
})

describe("computeDisabledExpertiseSkills", () => {
  it("disables skills above current expertise rank", () => {
    const disabled = computeDisabledExpertiseSkills([5801, 5802], new Map([[0, 50000]]))
    expect(disabled.has(5801)).toBe(false)
    expect(disabled.has(5802)).toBe(true)
  })
})

describe("computeArmoryTotalStats", () => {
  it("adds passive expertise STR from learned Strength UP1", () => {
    const result = computeArmoryTotalStats({
      base: emptyBase,
      equipment: [],
      learnedSkills: [5801],
      expertisePoints: new Map([[0, 60000]]),
      fuseBySlot: new Map(),
    })
    expect(result.total.str).toBe(emptyBase.str + 3)
    expect(result.bonus.str).toBe(3)
  })

  it("adds switch skill MAG and LNC-conditional soul fusion", () => {
    const equipment: ArmoryEquipmentSlot[] = [
      {
        slot: "top",
        label: "Top",
        index: 3,
        itemType: 48058,
        name: "Test top",
        level: 99,
        iconSrc: null,
        tarot: 564,
        soul: 241,
        basicEffect: 0,
        specialEffect: 0,
        modSlots: [],
      },
    ]
    const result = computeArmoryTotalStats({
      base: emptyBase,
      equipment,
      learnedSkills: [5079, 5595],
      expertisePoints: new Map(),
      fuseBySlot: new Map(),
      lnc: -10000,
    })
    expect(result.total.magic).toBeGreaterThan(emptyBase.magic + 30)
  })

  it("adds MAG when tarot fusion is on worn gear", () => {
    const equipment: ArmoryEquipmentSlot[] = [
      {
        slot: "weapon",
        label: "Weapon",
        index: 13,
        itemType: 1206,
        name: "Test weapon",
        level: 50,
        iconSrc: null,
        tarot: 564,
        soul: 0,
        basicEffect: 0,
        specialEffect: 0,
        modSlots: [],
      },
    ]
    const result = computeArmoryTotalStats({
      base: emptyBase,
      equipment,
      learnedSkills: [],
      expertisePoints: new Map(),
      fuseBySlot: new Map(),
    })
    expect(result.total.magic).toBeGreaterThan(emptyBase.magic)
    expect(result.bonus.magic).toBeGreaterThan(0)
  })
})
