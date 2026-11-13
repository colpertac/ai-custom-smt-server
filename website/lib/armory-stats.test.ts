import { describe, expect, it } from "vitest"

import {
  chantTimeFromStats,
  computeArmoryEstimate,
  computeArmoryTotalStats,
  computeDisabledExpertiseSkills,
  cooldownTimeFromStats,
  decodeLearnedSkillIds,
  LB_CAP_BASE,
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
      activeSwitchSkills: [5079, 5595],
      expertisePoints: new Map(),
      fuseBySlot: new Map(),
      lnc: -10000,
    })
    expect(result.total.magic).toBeGreaterThan(emptyBase.magic + 30)
  })

  it("leaves learned switch skills off unless toggled on", () => {
    // 5595 is a switch: MAG +25, PDEF -15 while on (session-only on the server)
    const input = {
      base: emptyBase,
      equipment: [],
      learnedSkills: [5595],
      expertisePoints: new Map(),
      fuseBySlot: new Map(),
    }
    expect(computeArmoryTotalStats(input).total.magic).toBe(emptyBase.magic)
    expect(
      computeArmoryTotalStats({ ...input, activeSwitchSkills: [5595] }).total.magic
    ).toBe(emptyBase.magic + 25)
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

describe("incant / cooldown dependent stats (CalculateDependentStats 0x04)", () => {
  it("subtracts floor(2.5·floor(INT/10) + 1.5·floor(SPD/10)) from CHANT_TIME", () => {
    expect(chantTimeFromStats(100, 117, 23)).toBe(70)
    // 2.5·1 + 1.5·0 = 2.5 → floor 2
    expect(chantTimeFromStats(100, 15, 9)).toBe(98)
    expect(chantTimeFromStats(100, 0, 0)).toBe(100)
  })

  it("uses VIT instead of INT for COOLDOWN_TIME", () => {
    expect(cooldownTimeFromStats(100, 104, 23)).toBe(72)
    expect(cooldownTimeFromStats(100, 40, 35)).toBe(86)
  })

  it("floors incant at 0 and cooldown at 5", () => {
    expect(chantTimeFromStats(100, 999, 999)).toBe(0)
    expect(cooldownTimeFromStats(100, 999, 999)).toBe(5)
    expect(cooldownTimeFromStats(10, 0, 0)).toBe(10)
  })
})

describe("computeArmoryEstimate combat bonuses", () => {
  const input = {
    base: emptyBase,
    equipment: [] as ArmoryEquipmentSlot[],
    expertisePoints: new Map<number, number>(),
    fuseBySlot: new Map<string, number[]>(),
  }

  it("starts from GetCharacterBaseStats defaults and INT/VIT/SPD", () => {
    const { combatBonuses } = computeArmoryEstimate({ ...input, learnedSkills: [] })
    expect(combatBonuses).toEqual({
      critical: 0,
      finalCritChance: 0,
      lbChance: 0,
      lbDamage: 100,
      lbCap: LB_CAP_BASE,
      techAttackRate: 0,
      techAttackPower: 0,
      pursuitRate: 0,
      pursuitPower: 0,
      // INT 30 / SPD 35: 100 − floor(7.5 + 4.5)
      incant: 88,
      // VIT 40 / SPD 35: 100 − floor(10 + 4.5)
      cooldown: 86,
    })
  })

  it("adds passive correctTbl rows and charastic tokusei aspects", () => {
    // 47: LB_CHANCE/LB_DAMAGE/CRITICAL +10; 632 → 870020 (TECH 5/5);
    // 723 + 724 → 880049 twice (PURSUIT_POWER 20 each); 1105 → 870034 (TAP 10).
    const { combatBonuses } = computeArmoryEstimate({
      ...input,
      learnedSkills: [47, 632, 723, 724, 1105],
    })
    expect(combatBonuses.critical).toBe(10)
    expect(combatBonuses.lbChance).toBe(10)
    expect(combatBonuses.lbDamage).toBe(100 + 10 + 20)
    expect(combatBonuses.techAttackRate).toBe(5)
    expect(combatBonuses.techAttackPower).toBe(15)
    expect(combatBonuses.pursuitPower).toBe(40)
  })

  it("applies layer-2 percentages after numeric sums (20181: CRITICAL −40%)", () => {
    // 5: CRITICAL +150; 20181 → 130103 (SUMMONER target = self): CRITICAL +40,
    // 130104: LB_DAMAGE +20; then layer 2 −40% on both.
    const { combatBonuses } = computeArmoryEstimate({
      ...input,
      learnedSkills: [5, 20181],
    })
    expect(combatBonuses.critical).toBe(190 + Math.trunc(190 * -0.4))
    expect(combatBonuses.lbDamage).toBe(120 + Math.trunc(120 * -0.4))
  })

  it("does not assume SKILL_ADD-granted switch skills are toggled on", () => {
    // 300290 → switch 45021 (PDEF/MDEF +999), 300291 → switch 45022
    // (INT/LUCK +999): ApplySkillCorrectTbls only counts active toggles.
    const plain = computeArmoryEstimate({ ...input, learnedSkills: [] })
    const granted = computeArmoryEstimate({
      ...input,
      learnedSkills: [],
      extraTokuseiIds: [300290, 300291],
    })
    expect(granted.computedStats.total).toEqual(plain.computedStats.total)
  })

  it("keeps computeArmoryTotalStats in sync with the estimate", () => {
    const args = { ...input, learnedSkills: [5801] }
    expect(computeArmoryTotalStats(args)).toEqual(
      computeArmoryEstimate(args).computedStats
    )
  })
})
