import { describe, expect, it } from "vitest"

import { getWikiItem } from "@/content/wiki"
import {
  activeAndPartialSets,
  applyLayerToSlot,
  canApplyLayer,
  computeGearPlannerCombat,
  emptyPlannerLoadout,
  equipWikiItemOntoSlot,
  equipmentSetMembership,
  itemLayerContribution,
  itemPieceContribution,
  itemSubcategory,
  rankItemsForStat,
} from "@/lib/gear-planner-combat"

describe("equipmentSetMembership", () => {
  it("lists Devil Doctor Glove set pieces for wiki linking", () => {
    const sets = equipmentSetMembership(5196)
    expect(sets.some((s) => s.id === 418)).toBe(true)
    const set = sets.find((s) => s.id === 418)!
    expect(set.members.map((m) => m.itemId).sort((a, b) => a - b)).toEqual([
      5196, 23271, 26139,
    ])
    expect(set.members.find((m) => m.itemId === 5196)?.isCurrent).toBe(true)
    expect(set.members.filter((m) => !m.isCurrent)).toHaveLength(2)
  })
})

describe("computeGearPlannerCombat", () => {
  it("counts EquipmentSet LBC once for set 167 (Top+Arms), not per piece", () => {
    let loadout = emptyPlannerLoadout()
    loadout = equipWikiItemOntoSlot(loadout, "top", getWikiItem(9854)!)
    loadout = equipWikiItemOntoSlot(loadout, "arms", getWikiItem(5120)!)

    const { activeSets } = activeAndPartialSets(loadout)
    expect(activeSets.some((s) => s.id === 167)).toBe(true)

    const result = computeGearPlannerCombat(loadout)
    expect(result.byStat.lbc.setBonus).toBe(20)
    expect(result.byStat.lbc.raw).toBe(
      result.byStat.lbc.bySlot.top +
        result.byStat.lbc.bySlot.arms +
        result.byStat.lbc.setBonus
    )
  })

  it("exposes per-layer contributions separately", () => {
    let loadout = emptyPlannerLoadout()
    const sword = getWikiItem(1214)!
    loadout = equipWikiItemOntoSlot(loadout, "weapon", sword)
    const result = computeGearPlannerCombat(loadout)
    const layers = result.byStat.critical.bySlotLayers.weapon
    expect(layers.s2).toBe(itemLayerContribution(sword, "s2", "critical"))
    expect(layers.s1 + layers.s2 + layers.s3).toBe(
      result.byStat.critical.bySlot.weapon
    )
  })

  it("stacks COOLDOWN_TIME set bonus and marks CD cap", () => {
    let loadout = emptyPlannerLoadout()
    for (const [key, id] of [
      ["head", 6533],
      ["top", 6812],
      ["bottom", 6374],
      ["feet", 6902],
    ] as const) {
      loadout = equipWikiItemOntoSlot(loadout, key, getWikiItem(id)!)
    }

    const result = computeGearPlannerCombat(loadout)
    expect(result.byStat.cooldown.setBonus).toBe(-30)

    const capped = computeGearPlannerCombat(loadout, {
      intel: 0,
      speed: 990,
      vit: 990,
    })
    expect(capped.byStat.cooldown.atCap).toBe(true)
  })
})

describe("applyLayerToSlot / canApplyLayer", () => {
  it("replaces only S2 and keeps S1 appearance id", () => {
    let loadout = emptyPlannerLoadout()
    const base = getWikiItem(1201)! // Machete
    const donor = getWikiItem(1214)! // Crystal Sword — same subcategory family ideally
    loadout = equipWikiItemOntoSlot(loadout, "weapon", base)

    // Find a donor with matching subcategory
    const baseSub = itemSubcategory(base.id)
    const poolDonor =
      baseSub != null && itemSubcategory(donor.id) === baseSub
        ? donor
        : getWikiItem(1202)!

    const check = canApplyLayer({
      target: loadout.find((s) => s.slot === "weapon")!,
      donor: poolDonor,
      layer: "s2",
      gender: 0,
    })
    expect(check.ok).toBe(true)

    loadout = applyLayerToSlot(loadout, "weapon", "s2", poolDonor)
    const slot = loadout.find((s) => s.slot === "weapon")!
    expect(slot.s1ItemId).toBe(base.id)
    expect(slot.s2ItemId).toBe(poolDonor.id)
    expect(slot.s3ItemId).toBe(base.id)
  })

  it("rejects S2 drop onto empty slot", () => {
    const loadout = emptyPlannerLoadout()
    const donor = getWikiItem(1214)!
    const check = canApplyLayer({
      target: loadout.find((s) => s.slot === "weapon")!,
      donor,
      layer: "s2",
      gender: 0,
    })
    expect(check.ok).toBe(false)
  })

  it("rejects wrong equip slot", () => {
    let loadout = emptyPlannerLoadout()
    loadout = equipWikiItemOntoSlot(loadout, "weapon", getWikiItem(1201)!)
    const top = getWikiItem(9854)!
    const check = canApplyLayer({
      target: loadout.find((s) => s.slot === "weapon")!,
      donor: top,
      layer: "s2",
      gender: 0,
    })
    expect(check.ok).toBe(false)
  })
})

describe("rankItemsForStat", () => {
  it("ranks Bottom pieces with cooldown contribution", () => {
    const hits = rankItemsForStat({
      stat: "cooldown",
      slot: "bottom",
      limit: 10,
    })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.pieceContribution).toBeLessThan(0)
  })

  it("boosts items that complete a set for the target stat", () => {
    let loadout = emptyPlannerLoadout()
    loadout = equipWikiItemOntoSlot(loadout, "top", getWikiItem(9854)!)
    const hits = rankItemsForStat({
      stat: "lbc",
      slot: "arms",
      loadout,
      limit: 50,
    })
    const arms = hits.find((h) => h.item.id === 5120)
    expect(arms).toBeTruthy()
    expect(arms!.completesSetIds).toContain(167)
    expect(arms!.setCompletionBonus).toBe(20)
  })
})

describe("itemPieceContribution", () => {
  it("reads S2 CRITICAL from Crystal Sword", () => {
    const item = getWikiItem(1214)
    expect(item).toBeTruthy()
    expect(itemPieceContribution(item!, "critical")).toBeGreaterThan(0)
  })
})
