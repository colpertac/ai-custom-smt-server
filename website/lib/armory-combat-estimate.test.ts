import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// lib/armory pulls in server-only (devil-catalog).
vi.mock("server-only", () => ({}))

import type { ArmoryCombatBonuses, ArmoryProfile } from "@/lib/armory"
import { mergeLiveArmoryProfile } from "@/lib/armory-live"
import { getWorldDbPath } from "@/lib/world-db"

const estimateBonuses: ArmoryCombatBonuses = {
  critical: 10,
  finalCritChance: 0,
  lbChance: 10,
  lbDamage: 110,
  lbCap: 30000,
  techAttackRate: 0,
  techAttackPower: 0,
  pursuitRate: 0,
  pursuitPower: 0,
  incant: 88,
  cooldown: 86,
}

const stats = {
  level: 99,
  xp: 0,
  hp: 100,
  mp: 50,
  maxHp: 100,
  maxMp: 50,
  str: 1,
  magic: 1,
  vit: 1,
  intel: 1,
  speed: 1,
  luck: 1,
  clsr: 1,
  lngr: 1,
  spell: 1,
  support: 1,
  pdef: 1,
  mdef: 1,
}

function offlineProfile(): ArmoryProfile {
  return {
    name: "cat",
    lnc: 0,
    title: 0,
    appearance: {} as ArmoryProfile["appearance"],
    stats,
    computedStats: { base: stats, total: stats, bonus: {} },
    clan: null,
    equipment: [],
    expertises: [],
    activeDemon: null,
    portraitUrl: null,
    portraitFingerprint: "",
    portraitStatus: "missing",
    statsSource: "estimate",
    combatBonuses: estimateBonuses,
    combatBonusesSource: "estimate",
  }
}

describe("mergeLiveArmoryProfile combat bonuses", () => {
  it("keeps the offline estimate when the character is not online", () => {
    const merged = mergeLiveArmoryProfile(
      offlineProfile(),
      { ok: false, offline: true },
      "2026-11-12T00:00:00Z"
    )
    expect(merged.statsSource).toBe("estimate")
    expect(merged.combatBonuses).toEqual(estimateBonuses)
    expect(merged.combatBonusesSource).toBe("estimate")
  })

  it("live values override the estimate", () => {
    const live = { ...estimateBonuses, critical: 999 }
    const merged = mergeLiveArmoryProfile(
      offlineProfile(),
      { ok: true, stats, combatBonuses: live },
      "2026-11-12T00:00:00Z"
    )
    expect(merged.statsSource).toBe("live")
    expect(merged.combatBonuses).toEqual(live)
    expect(merged.combatBonusesSource).toBe("live")
  })

  it("falls back to the estimate when a live payload has no combatBonuses", () => {
    const merged = mergeLiveArmoryProfile(
      offlineProfile(),
      { ok: true, stats },
      "2026-11-12T00:00:00Z"
    )
    expect(merged.statsSource).toBe("live")
    expect(merged.combatBonuses).toEqual(estimateBonuses)
    expect(merged.combatBonusesSource).toBe("estimate")
  })
})

describe.skipIf(!fs.existsSync(getWorldDbPath()))(
  "loadArmoryProfile offline combat bonuses (local world DB)",
  () => {
    let portraitsDir = ""
    const prevDataDir = process.env.WEBSITE_DATA_DIR

    beforeEach(() => {
      portraitsDir = fs.mkdtempSync(path.join(os.tmpdir(), "armory-combat-"))
      process.env.WEBSITE_DATA_DIR = portraitsDir
    })

    afterEach(() => {
      if (prevDataDir == null) delete process.env.WEBSITE_DATA_DIR
      else process.env.WEBSITE_DATA_DIR = prevDataDir
      fs.rmSync(portraitsDir, { recursive: true, force: true })
    })

    it("returns estimated combatBonuses for an offline character", async () => {
      const { loadArmoryProfile } = await import("@/lib/armory")
      const profile = await loadArmoryProfile("admin", { enqueuePortrait: false })
      if (!profile?.stats) return
      expect(profile.statsSource).toBe("estimate")
      expect(profile.combatBonusesSource).toBe("estimate")
      const bonuses = profile.combatBonuses
      expect(bonuses).toBeTruthy()
      expect(bonuses!.lbCap).toBeGreaterThanOrEqual(30000)
      expect(bonuses!.lbDamage).toBeGreaterThanOrEqual(0)
      expect(bonuses!.incant).toBeGreaterThanOrEqual(0)
      expect(bonuses!.cooldown).toBeGreaterThanOrEqual(5)
      expect(bonuses!.incant).toBeLessThanOrEqual(100)
    })
  }
)
