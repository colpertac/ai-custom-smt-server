import { describe, expect, it } from "vitest"

import { getWikiItem } from "@/content/wiki"
import {
  canApplyEnchant,
  canApplyLayer,
  computeGearPlannerCombat,
  emptyPlannerLoadout,
  equipWikiItemOntoSlot,
  type PlannerSlot,
} from "@/lib/gear-planner-combat"
import {
  compareFitness,
  DEFAULT_OPTIMIZE_PRIORITIES,
  diffLoadouts,
  hardDeficitForStat,
  isBetterFitness,
  optimizeGearLoadout,
  pruneBeamDiverse,
  scoreLoadout,
  s1Fingerprint,
  s1Overlap,
  softScoreFromResult,
  type LoadoutFitness,
} from "@/lib/gear-planner-optimize"

const attrs = {
  str: 50,
  magic: 50,
  vit: 50,
  intel: 50,
  speed: 50,
  luck: 50,
  level: 99,
}

function fitnessWith(
  hardDeficit: number,
  soft: number,
  overrides?: Partial<LoadoutFitness>
): LoadoutFitness {
  return {
    hardDeficit,
    soft,
    deficits: {
      lbc: hardDeficit,
      tac: 0,
      pc: 0,
      pp: 0,
      incant: 0,
      cooldown: 0,
    },
    atCap: {
      lbc: hardDeficit === 0,
      tac: true,
      pc: true,
      pp: true,
      incant: true,
      cooldown: true,
    },
    ...overrides,
  }
}

describe("hardDeficitForStat", () => {
  it("computes percent / reduction deficits", () => {
    expect(hardDeficitForStat("lbc", 80)).toBe(20)
    expect(hardDeficitForStat("lbc", 100)).toBe(0)
    expect(hardDeficitForStat("cooldown", 12)).toBe(7)
    expect(hardDeficitForStat("cooldown", 5)).toBe(0)
  })
})

describe("scoreLoadout / fitness order", () => {
  it("ranks lower hard deficit above higher soft", () => {
    const uncapped = fitnessWith(40, 9999)
    const capped = fitnessWith(0, 10)
    expect(isBetterFitness(capped, uncapped)).toBe(true)
    expect(compareFitness(capped, uncapped)).toBeLessThan(0)
  })

  it("uses soft as tie-break when hard equal", () => {
    const a = fitnessWith(0, 100)
    const b = fitnessWith(0, 200)
    expect(isBetterFitness(b, a)).toBe(true)
  })

  it("soft priorities change soft score", () => {
    let loadout = emptyPlannerLoadout()
    loadout = equipWikiItemOntoSlot(loadout, "weapon", getWikiItem(1254)!)
    const result = computeGearPlannerCombat(loadout, attrs)
    const critFirst = softScoreFromResult(result, ["critical", "lbp"])
    const lbpFirst = softScoreFromResult(result, ["lbp", "critical"])
    expect(critFirst).not.toBe(lbpFirst)
    const base = scoreLoadout(result, DEFAULT_OPTIMIZE_PRIORITIES)
    expect(base.hardDeficit).toBeGreaterThanOrEqual(0)
  })
})

describe("canApplyLayer S1 replace", () => {
  it("allows replacing machete S1 with a different weapon family", () => {
    let loadout = emptyPlannerLoadout()
    loadout = equipWikiItemOntoSlot(loadout, "weapon", getWikiItem(1201)!)
    const donor = getWikiItem(2383)! // Masakado's Sword
    const check = canApplyLayer({
      target: loadout.find((s) => s.slot === "weapon")!,
      donor,
      layer: "s1",
      gender: 0,
    })
    expect(check.ok).toBe(true)
  })

  it("still rejects S2 subcategory mismatch", () => {
    let loadout = emptyPlannerLoadout()
    loadout = equipWikiItemOntoSlot(loadout, "weapon", getWikiItem(1201)!)
    const donor = getWikiItem(2383)!
    const check = canApplyLayer({
      target: loadout.find((s) => s.slot === "weapon")!,
      donor,
      layer: "s2",
      gender: 0,
    })
    expect(check.ok).toBe(false)
  })
})

describe("s1 diversity helpers", () => {
  it("fingerprints and overlap detect shared S1s", () => {
    let a = emptyPlannerLoadout()
    let b = emptyPlannerLoadout()
    const sword = getWikiItem(1214)!
    const other = getWikiItem(1254)!
    a = equipWikiItemOntoSlot(a, "weapon", sword)
    b = equipWikiItemOntoSlot(b, "weapon", sword)
    expect(s1Fingerprint(a)).toBe(s1Fingerprint(b))
    expect(s1Overlap(a, b)).toBe(1)

    b = equipWikiItemOntoSlot(b, "weapon", other)
    expect(s1Fingerprint(a)).not.toBe(s1Fingerprint(b))
    expect(s1Overlap(a, b)).toBe(0)
  })

  it("pruneBeamDiverse keeps differently-fingerprinted peers", () => {
    let a = emptyPlannerLoadout()
    let b = emptyPlannerLoadout()
    a = equipWikiItemOntoSlot(a, "weapon", getWikiItem(1214)!)
    b = equipWikiItemOntoSlot(b, "weapon", getWikiItem(1254)!)
    const fa = scoreLoadout(computeGearPlannerCombat(a, attrs))
    const fb = scoreLoadout(computeGearPlannerCombat(b, attrs))
    const beams = pruneBeamDiverse(
      [
        {
          loadout: a,
          fitness: { ...fa, hardDeficit: 10, soft: 1 },
          fingerprint: s1Fingerprint(a),
        },
        {
          loadout: b,
          fitness: { ...fb, hardDeficit: 10, soft: 1 },
          fingerprint: s1Fingerprint(b),
        },
      ],
      2
    )
    expect(beams).toHaveLength(2)
  })
})

describe("optimizeGearLoadout", () => {
  it("improves bare machete (replaces S1 / fills layers)", async () => {
    let loadout = emptyPlannerLoadout()
    loadout = equipWikiItemOntoSlot(loadout, "weapon", getWikiItem(1201)!)
    const before = scoreLoadout(computeGearPlannerCombat(loadout, attrs))

    const result = await optimizeGearLoadout({
      loadout,
      attrs,
      lnc: 1,
      gender: 0,
      timeBudgetMs: 2500,
      priorities: [...DEFAULT_OPTIMIZE_PRIORITIES],
    })

    expect(result.changes.length).toBeGreaterThan(0)
    expect(result.after.hardDeficit).toBeLessThan(before.hardDeficit)
    const weapon = result.loadout.find((s) => s.slot === "weapon")!
    // Should not remain a pure empty-layer machete shell.
    const improved =
      weapon.s1ItemId !== 1201 ||
      weapon.tarotEnchantId != null ||
      weapon.soulEnchantId != null ||
      result.loadout.some((s) => s.slot !== "weapon" && s.s1ItemId != null)
    expect(improved).toBe(true)
  }, 20000)

  it("respects lockS1 (existing S1 ids unchanged; empty slots may fill)", async () => {
    let loadout = emptyPlannerLoadout()
    loadout = equipWikiItemOntoSlot(loadout, "weapon", getWikiItem(1214)!)
    loadout = equipWikiItemOntoSlot(loadout, "top", getWikiItem(9854)!)
    const locked = new Map(
      loadout
        .filter((s) => s.s1ItemId != null)
        .map((s) => [s.slot, s.s1ItemId] as const)
    )

    const result = await optimizeGearLoadout({
      loadout,
      attrs,
      lnc: 1,
      gender: 0,
      lockS1: true,
      timeBudgetMs: 400,
    })

    for (const [slot, id] of locked) {
      expect(result.loadout.find((s) => s.slot === slot)?.s1ItemId).toBe(id)
    }
  })

  it("returns within budget with evaluations > 0", async () => {
    const budget = 800
    const started = Date.now()
    const result = await optimizeGearLoadout({
      loadout: emptyPlannerLoadout(),
      attrs,
      lnc: 1,
      gender: 0,
      timeBudgetMs: budget,
    })
    expect(result.evaluations).toBeGreaterThan(0)
    expect(Date.now() - started).toBeLessThan(budget + 8000)
  })

  it("only produces apply-valid loadouts", async () => {
    let loadout = emptyPlannerLoadout()
    loadout = equipWikiItemOntoSlot(loadout, "weapon", getWikiItem(1214)!)

    const result = await optimizeGearLoadout({
      loadout,
      attrs,
      lnc: 1,
      gender: 0,
      lockS1: true,
      timeBudgetMs: 500,
    })

    for (const slot of result.loadout) {
      if (slot.s1ItemId == null) continue
      if (slot.s2ItemId != null) {
        expect(
          canApplyLayer({
            target: slot,
            donor: getWikiItem(slot.s2ItemId)!,
            layer: "s2",
            gender: 0,
          }).ok
        ).toBe(true)
      }
      if (slot.s3ItemId != null) {
        expect(
          canApplyLayer({
            target: slot,
            donor: getWikiItem(slot.s3ItemId)!,
            layer: "s3",
            gender: 0,
          }).ok
        ).toBe(true)
      }
      if (slot.tarotEnchantId != null) {
        expect(
          canApplyEnchant({
            target: slot,
            enchantId: slot.tarotEnchantId,
            side: "tarot",
          }).ok
        ).toBe(true)
      }
      if (slot.soulEnchantId != null) {
        expect(
          canApplyEnchant({
            target: slot,
            enchantId: slot.soulEnchantId,
            side: "soul",
          }).ok
        ).toBe(true)
      }
    }
  })

  it("diffLoadouts lists changed layers", () => {
    let before = emptyPlannerLoadout()
    let after = emptyPlannerLoadout()
    before = equipWikiItemOntoSlot(before, "weapon", getWikiItem(1214)!)
    after = equipWikiItemOntoSlot(after, "weapon", getWikiItem(1254)!)
    const changes = diffLoadouts(before, after)
    expect(changes.some((c) => c.slot === "weapon" && c.layer === "s1")).toBe(
      true
    )
  })
})

describe("scoreLoadout from real combat", () => {
  it("marks hard caps from computeGearPlannerCombat", () => {
    const loadout: PlannerSlot[] = emptyPlannerLoadout()
    const result = computeGearPlannerCombat(loadout, attrs)
    const fitness = scoreLoadout(result)
    expect(fitness.hardDeficit).toBeGreaterThan(0)
    expect(fitness.atCap.lbc).toBe(false)
  })
})
