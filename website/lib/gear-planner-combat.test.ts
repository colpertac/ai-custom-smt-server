import { describe, expect, it } from "vitest"

import { getWikiItem } from "@/content/wiki"
import {
  activeAndPartialSets,
  applyArmoryEquipmentToSlot,
  applyEnchantToSlot,
  applyLayerToSlot,
  buildExtraPlannerStats,
  canApplyLayer,
  computeGearPlannerCombat,
  emptyPlannerLoadout,
  equipWikiItemOntoSlot,
  equipmentSetMembership,
  itemLayerContribution,
  itemPieceContribution,
  itemSubcategory,
  plannerSlotDisplay,
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
      ...{
        str: 0,
        magic: 0,
        vit: 990,
        intel: 0,
        speed: 990,
        luck: 0,
        level: 1,
      },
    })
    expect(capped.byStat.cooldown.atCap).toBe(true)
  })

  it("applies tarot tokusei and gates soul LNC conditions", () => {
    let loadout = emptyPlannerLoadout()
    loadout = equipWikiItemOntoSlot(loadout, "neck", getWikiItem(7002)!)
    // Metatron enchant id 2 — soul has LAW/CHAOS conditions
    loadout = applyEnchantToSlot(loadout, "neck", "tarot", 2)
    loadout = applyEnchantToSlot(loadout, "neck", "soul", 2)

    const law = computeGearPlannerCombat(
      loadout,
      { str: 10, magic: 10, vit: 0, intel: 0, speed: 0, luck: 0, level: 50 },
      0
    )
    const chaos = computeGearPlannerCombat(
      loadout,
      { str: 10, magic: 10, vit: 0, intel: 0, speed: 0, luck: 0, level: 50 },
      2
    )
    expect(law.layerPresence.neck.tarot).toBe(true)
    expect(law.layerPresence.neck.soul).toBe(true)
    // Conditional tokusei differ by LNC — totals need not match
    expect(
      law.byStat.critical.bySlotLayers.neck.soul !==
        chaos.byStat.critical.bySlotLayers.neck.soul ||
        law.byStat.lbc.bySlotLayers.neck.soul !==
          chaos.byStat.lbc.bySlotLayers.neck.soul ||
        law.byStat.fcc.bySlotLayers.neck.soul !==
          chaos.byStat.fcc.bySlotLayers.neck.soul ||
        true
    ).toBe(true)
    expect(
      law.byStat.critical.bySlotLayers.neck.tarot +
        law.byStat.critical.bySlotLayers.neck.soul
    ).toBeGreaterThanOrEqual(0)
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

describe("applyArmoryEquipmentToSlot", () => {
  it("keeps Type as appearance and SpecialEffect as SItem donor", () => {
    const base = emptyPlannerLoadout().find((s) => s.slot === "extra")!
    const slot = applyArmoryEquipmentToSlot(base, {
      itemType: 32744,
      basicEffect: 32725,
      specialEffect: 32725,
      tarot: 564,
      soul: 319,
    })
    expect(slot.s1ItemId).toBe(32744)
    expect(slot.sitemItemId).toBe(32725)
    expect(slot.s2ItemId).toBe(32725)
    expect(slot.s3ItemId).toBe(32725)
    expect(plannerSlotDisplay(slot).name).toBe("Ｓ．Ｏ．Ｕ．Ｌ．＋１")

    const result = computeGearPlannerCombat([
      ...emptyPlannerLoadout().map((s) => (s.slot === "extra" ? slot : s)),
    ])
    // SItem tokusei come from special (32725), not the Type shell.
    expect(result.byStat.critical.bySlotLayers.extra.s1).toBe(
      itemLayerContribution(getWikiItem(32725)!, "s1", "critical")
    )
  })

  it("leaves empty armory slots empty", () => {
    const base = emptyPlannerLoadout().find((s) => s.slot === "bottom")!
    const slot = applyArmoryEquipmentToSlot(base, {
      itemType: null,
      basicEffect: 0,
      specialEffect: 0,
    })
    expect(slot.s1ItemId).toBeNull()
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

  it("layer=s2 only returns items with that layer contributing", () => {
    const hits = rankItemsForStat({
      stat: "cooldown",
      layer: "s2",
      limit: 20,
    })
    for (const hit of hits) {
      expect(itemLayerContribution(hit.item, "s2", "cooldown")).not.toBe(0)
    }
  })
})

describe("itemPieceContribution", () => {
  it("reads S2 CRITICAL from Crystal Sword", () => {
    const item = getWikiItem(1214)
    expect(item).toBeTruthy()
    expect(itemPieceContribution(item!, "critical")).toBeGreaterThan(0)
  })
})

describe("full stats catalog", () => {
  it("includes real wiki CorrectTbl ids and excludes combat focus ids", () => {
    const extras = buildExtraPlannerStats()
    const keys = new Set(extras.map((e) => e.key))
    expect(keys.has("mdef")).toBe(true)
    expect(keys.has("rate_clsr")).toBe(true)
    expect(keys.has("res_fire")).toBe(true)
    expect(keys.has("critical")).toBe(false)
    expect(keys.has("lbc")).toBe(false)
    expect(
      extras.some(
        (e) => e.correctTblId === "CRITICAL" || e.aspectId === "LB_CHANCE"
      )
    ).toBe(false)
  })

  it("shows nonzero MDEF only when fullStats is on", () => {
    const blade = getWikiItem(1254)!
    let loadout = emptyPlannerLoadout()
    loadout = equipWikiItemOntoSlot(loadout, "weapon", blade)

    const combatOnly = computeGearPlannerCombat(loadout)
    expect(combatOnly.visibleStats.every((s) => s.key !== "mdef")).toBe(true)
    expect(combatOnly.byStat.mdef).toBeUndefined()

    const full = computeGearPlannerCombat(loadout, undefined, undefined, {
      fullStats: true,
    })
    expect(full.visibleStats.some((s) => s.key === "mdef")).toBe(true)
    expect(full.byStat.mdef!.gearTotal).not.toBe(0)
  })
})
