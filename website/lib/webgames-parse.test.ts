import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  applyKinoSettings,
  applyRouletteSettings,
  applySlotSettings,
  parseKinoSettings,
  parseRouletteSettings,
  parseSlotSettings,
} from "@/lib/webgames-parse"

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const WEBGAMES = path.join(REPO, "deploy/data/datastore/webgames")

describe("webgames parse", () => {
  it("parses slot defaults", () => {
    const source = readFileSync(path.join(WEBGAMES, "slot.nut"), "utf8")
    const settings = parseSlotSettings(source)
    expect(settings.coinCost).toBe(10)
    expect(settings.reelItemPayout).toEqual([
      100, 100, 100, 100, 100, 20, 30, 30, 50,
    ])
  })

  it("rewrites slot payouts in place", () => {
    const source = readFileSync(path.join(WEBGAMES, "slot.nut"), "utf8")
    const next = applySlotSettings(source, {
      coinCost: 25,
      reelItemPayout: [10, 20, 30, 40, 50, 60, 70, 80, 90],
    })
    const settings = parseSlotSettings(next)
    expect(settings.coinCost).toBe(25)
    expect(settings.reelItemPayout[8]).toBe(90)
    expect(next).toContain("DO NOT MODIFY BELOW THIS POINT")
    expect(next).toContain("function spin(")
  })

  it("parses and rewrites roulette jackpot knobs", () => {
    const source = readFileSync(path.join(WEBGAMES, "roulette.nut"), "utf8")
    const settings = parseRouletteSettings(source)
    expect(settings).toEqual({
      coinCost: 50,
      maxDoubleUp: 4,
      baseJackpot: 120,
      jackpotMod: 1337,
      jackpotMult: 11,
    })
    const next = applyRouletteSettings(source, {
      ...settings,
      coinCost: 100,
      jackpotMult: 22,
    })
    expect(parseRouletteSettings(next).coinCost).toBe(100)
    expect(parseRouletteSettings(next).jackpotMult).toBe(22)
  })

  it("parses and rewrites kino prediction tables", () => {
    const source = readFileSync(path.join(WEBGAMES, "kino.nut"), "utf8")
    const settings = parseKinoSettings(source)
    expect(settings.baseJackpot).toBe(777777)
    expect(settings.predictCosts).toHaveLength(24)
    expect(settings.predictCosts[0]).toBe(100)
    expect(settings.predictWinnings[2]).toBe(666666)
    const next = applyKinoSettings(source, {
      ...settings,
      baseJackpot: 1000,
      predictCosts: settings.predictCosts.map((v, i) => (i === 0 ? 50 : v)),
    })
    const updated = parseKinoSettings(next)
    expect(updated.baseJackpot).toBe(1000)
    expect(updated.predictCosts[0]).toBe(50)
    expect(updated.predictLimits[13]).toBe(7)
  })
})
