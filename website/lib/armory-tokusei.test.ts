import { describe, expect, it } from "vitest"

import {
  calculateAttributeValue,
  evaluateTokuseiConditions,
  getTokuseiEffect,
  isEffectiveOnCharacter,
  isLncTypeLinear,
  sumTokuseiAspect,
  tokuseiSkillAdds,
  type TokuseiCharacterContext,
  type TokuseiEffect,
} from "@/lib/armory-tokusei"

function ctx(over: Partial<TokuseiCharacterContext> = {}): TokuseiCharacterContext {
  return {
    level: 99,
    lnc: 0,
    gender: 0,
    expertisePoints: new Map(),
    weaponSubcategory: null,
    digitalized: false,
    hpPercent: 100,
    mpPercent: 100,
    inParty: false,
    compendiumCount: 0,
    questBonusCount: 0,
    ...over,
  }
}

const noStats = () => 0

describe("calculateAttributeValue (TokuseiManager::CalculateAttributeValue)", () => {
  it("returns the raw value without attributes", () => {
    expect(calculateAttributeValue(30, 0, undefined, ctx(), noStats)).toBe(30)
  })

  it("LEVEL multiplies by level after precision (570220: STR 15/100 per level)", () => {
    const v = calculateAttributeValue(
      15,
      0,
      { mult: "LEVEL", precision: 2 },
      ctx({ level: 99 }),
      noStats
    )
    expect(v).toBeCloseTo(14.85)
    // AdjustStats truncates TokuseiCorrectTbl values.
    expect(Math.trunc(v)).toBe(14)
  })

  it("BASE_AND_LEVEL multiplies by level and the core stat", () => {
    expect(
      calculateAttributeValue(1, 20, { mult: "BASE_AND_LEVEL", precision: 2 }, ctx({ level: 50 }), noStats)
    ).toBeCloseTo(10)
  })

  it("EXPERTISE multiplies by floor(points * 0.0001) (400000: CHANT -0.4 per MC rank)", () => {
    const v = calculateAttributeValue(
      -4,
      0,
      { mult: "EXPERTISE", value: 36, precision: 1 },
      ctx({ expertisePoints: new Map([[36, 509_999]]) }),
      noStats
    )
    expect(v).toBeCloseTo(-20)
  })

  it("CORRECT_TABLE reads the current CorrectTbl value (880001: PURSUIT_RATE 0.1 × STR)", () => {
    const stat = (id: string) => (id === "STR" ? 104 : 0)
    expect(
      calculateAttributeValue(10, 0, { mult: "CORRECT_TABLE", tbl: "STR", precision: 2 }, ctx(), stat)
    ).toBeCloseTo(10.4)
    expect(
      calculateAttributeValue(100, 0, { mult: "CORRECT_TABLE_DIVIDE", tbl: "LUCK" }, ctx(), (id) =>
        id === "LUCK" ? 40 : 0
      )
    ).toBe(2.5)
    expect(
      calculateAttributeValue(100, 0, { mult: "CORRECT_TABLE_DIVIDE", tbl: "LUCK" }, ctx(), noStats)
    ).toBe(0)
  })

  it("party/partner/quest multipliers and NONE are 0 offline", () => {
    for (const mult of ["PARTY_SIZE", "DEMON_BOOK_FAMILY_DIVIDE", "QUEST_BONUS_DIVIDE", "NONE"]) {
      expect(calculateAttributeValue(10, 0, { mult, value: 5 }, ctx(), noStats)).toBe(0)
    }
  })

  it("DEMON_BOOK_DIVIDE uses floor(compendium / divisor)", () => {
    expect(
      calculateAttributeValue(2, 0, { mult: "DEMON_BOOK_DIVIDE", value: 50 }, ctx({ compendiumCount: 149 }), noStats)
    ).toBe(4)
  })

  it("HP_LTE scales only at or below the HP threshold", () => {
    const attr = { mult: "HP_LTE", value: 200, precision: 30 }
    expect(calculateAttributeValue(15, 0, attr, ctx({ hpPercent: 100 }), noStats)).toBe(15)
    expect(calculateAttributeValue(15, 0, attr, ctx({ hpPercent: 30 }), noStats)).toBe(30)
  })
})

describe("tokusei conditions (TokuseiManager::EvaluateTokuseiConditions)", () => {
  const swordOrSpear = getTokuseiEffect(520014)!

  it("OptionGroupID conditions are OR'd (520014: weapon subcategory 23–26)", () => {
    expect(swordOrSpear.conditions).toHaveLength(4)
    expect(evaluateTokuseiConditions(swordOrSpear, ctx({ weaponSubcategory: 25 }))).toBe(true)
    expect(evaluateTokuseiConditions(swordOrSpear, ctx({ weaponSubcategory: 7 }))).toBe(false)
    expect(evaluateTokuseiConditions(swordOrSpear, ctx())).toBe(false)
  })

  it("ungrouped conditions are AND'd", () => {
    const effect: TokuseiEffect = {
      conditions: [
        { type: "GENDER", value: 1 },
        { type: "LNC", value: 4 },
      ],
    }
    expect(evaluateTokuseiConditions(effect, ctx({ gender: 1, lnc: 6000 }))).toBe(true)
    expect(evaluateTokuseiConditions(effect, ctx({ gender: 1, lnc: 0 }))).toBe(false)
    expect(evaluateTokuseiConditions(effect, ctx({ gender: 0, lnc: 6000 }))).toBe(false)
  })

  it("LNC uses the linear mode: 0/2/4 = L/N/C, 1 = L|N, 3 = N|C, 5 = L|C", () => {
    expect(isLncTypeLinear(-5000, 0)).toBe(true)
    expect(isLncTypeLinear(-5000, 1)).toBe(true)
    expect(isLncTypeLinear(-5000, 3)).toBe(false)
    expect(isLncTypeLinear(0, 3)).toBe(true)
    expect(isLncTypeLinear(5000, 5)).toBe(true)
    expect(isLncTypeLinear(0, 5)).toBe(false)
  })

  it("EXPERTISE packs id in the last two digits and rank above", () => {
    const effect: TokuseiEffect = {
      conditions: [{ type: "EXPERTISE", value: 3036, cmp: "GTE" }],
    }
    expect(
      evaluateTokuseiConditions(effect, ctx({ expertisePoints: new Map([[36, 300_000]]) }))
    ).toBe(true)
    expect(
      evaluateTokuseiConditions(effect, ctx({ expertisePoints: new Map([[36, 299_999]]) }))
    ).toBe(false)
  })

  it("DIGITALIZED / CURRENT_HP / partner / timed conditions", () => {
    const digi: TokuseiEffect = { conditions: [{ type: "DIGITALIZED", value: 0 }] }
    expect(evaluateTokuseiConditions(digi, ctx())).toBe(false)
    expect(evaluateTokuseiConditions(digi, ctx({ digitalized: true }))).toBe(true)
    const lowHp: TokuseiEffect = {
      conditions: [{ type: "CURRENT_HP", value: 10, cmp: "LTE" }],
    }
    expect(evaluateTokuseiConditions(lowHp, ctx())).toBe(false)
    expect(evaluateTokuseiConditions(lowHp, ctx({ hpPercent: 9 }))).toBe(true)
    // 500000: partner familiarity ≥ 8001 → no summoned partner offline.
    expect(evaluateTokuseiConditions(getTokuseiEffect(500000)!, ctx())).toBe(false)
    expect(
      evaluateTokuseiConditions({ conditions: [{ type: "MOON_PHASE", value: 8 }] }, ctx())
    ).toBe(false)
  })

  it("only SELF/SUMMONER (and PARTY in a party) non-skill tokusei are effective", () => {
    expect(isEffectiveOnCharacter({}, ctx())).toBe(true)
    expect(isEffectiveOnCharacter({ target: "SUMMONER" }, ctx())).toBe(true)
    expect(isEffectiveOnCharacter({ target: "PARTNER" }, ctx())).toBe(false)
    expect(isEffectiveOnCharacter({ target: "PARTY" }, ctx())).toBe(false)
    expect(isEffectiveOnCharacter({ target: "PARTY" }, ctx({ inParty: true }))).toBe(true)
    // 180687: LB_DAMAGE +15 vs. an enemy LNC → skill processing only.
    expect(getTokuseiEffect(180687)?.skill).toBe(true)
    expect(isEffectiveOnCharacter(getTokuseiEffect(180687)!, ctx())).toBe(false)
  })
})

describe("sumTokuseiAspect (TokuseiManager::GetAspectSum)", () => {
  it("sums each source (870000 twice: TECH 100 + 100, power 10 + 10)", () => {
    expect(sumTokuseiAspect([870000, 870000], "TECH_ATTACK_RATE", ctx(), noStats)).toBe(200)
    expect(sumTokuseiAspect([870000, 870000], "TECH_ATTACK_POWER", ctx(), noStats)).toBe(20)
    expect(sumTokuseiAspect([870000], "PURSUIT_RATE", ctx(), noStats)).toBe(0)
  })

  it("applies aspect attributes before summing (880001: 0.1 × STR)", () => {
    const stat = (id: string) => (id === "STR" ? 104 : 0)
    expect(Math.floor(sumTokuseiAspect([880001], "PURSUIT_RATE", ctx(), stat))).toBe(10)
  })

  it("LIMIT_BREAK_MAX (1120000: +100 each)", () => {
    expect(sumTokuseiAspect([1120000, 1120000], "LIMIT_BREAK_MAX", ctx(), noStats)).toBe(200)
  })

  it("SKILL_ADD aspects list granted skills", () => {
    expect(tokuseiSkillAdds([870000])).toEqual([])
  })
})
