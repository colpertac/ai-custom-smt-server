import { describe, expect, it } from "vitest"

import {
  computeChainExpertisePoints,
  expertiseMaxPoints,
  getExpertiseIconSrc,
  getExpertiseMeta,
  getExpertiseName,
  parseExpertiseProgress,
} from "@/lib/armory-catalogs"

describe("parseExpertiseProgress", () => {
  it("maps 1900 display pts (190000 stored) to class 1 rank 9", () => {
    const p = parseExpertiseProgress(190_000, 10, 0)
    expect(p.classLevel).toBe(1)
    expect(p.rank).toBe(9)
    expect(p.displayPoints).toBe(1900)
    expect(p.classProgress).toBeCloseTo(0.9, 5)
    expect(p.atMax).toBe(false)
  })

  it("maps 2000 display pts to class 2 rank 0", () => {
    const p = parseExpertiseProgress(200_000, 10, 0)
    expect(p.classLevel).toBe(2)
    expect(p.rank).toBe(0)
    expect(p.displayPoints).toBe(2000)
    expect(p.classProgress).toBe(0)
  })

  it("caps Talk at class 2", () => {
    const meta = getExpertiseMeta(12)
    expect(meta.maxClass).toBe(2)
    expect(getExpertiseName(12)).toBe("Talk")
    const max = expertiseMaxPoints(meta.maxClass, meta.maxRank)
    const p = parseExpertiseProgress(max, meta.maxClass, meta.maxRank)
    expect(p.atMax).toBe(true)
    expect(p.classLevel).toBe(2)
    expect(p.rank).toBe(0)
    expect(p.classProgress).toBe(1)
  })

  it("handles partial final class (maxRank > 0)", () => {
    // Blades id 29: maxClass 7 maxRank 2 → max 720000
    const meta = getExpertiseMeta(29)
    expect(meta.maxClass).toBe(7)
    expect(meta.maxRank).toBe(2)
    const mid = parseExpertiseProgress(710_000, meta.maxClass, meta.maxRank)
    expect(mid.classLevel).toBe(7)
    expect(mid.rank).toBe(1)
    expect(mid.classProgress).toBeCloseTo(0.5, 5)
  })

  it("uses Attack max class 9 from ExpertClassData", () => {
    expect(getExpertiseMeta(0).maxClass).toBe(9)
    expect(getExpertiseName(0)).toBe("Attack")
  })

  it("marks Talk as standard and Botany as unimplemented", () => {
    expect(getExpertiseMeta(12).isChain).toBe(false)
    expect(getExpertiseMeta(12).implemented).toBe(true)
    expect(getExpertiseMeta(26).implemented).toBe(false)
    expect(getExpertiseMeta(33).name).toBe("Firearms Knowledge")
    expect(getExpertiseMeta(33).implemented).toBe(false)
  })

  it("marks Synthesis as chain with icon", () => {
    const meta = getExpertiseMeta(49)
    expect(meta.isChain).toBe(true)
    expect(meta.implemented).toBe(true)
    expect(meta.icon).toBe("synthesis-01")
    expect(getExpertiseIconSrc(49)).toBe("/armory/expertise/synthesis-01.png")
  })

  it("derives Rampage from Attack/Spin/Rush/Pursuit like the server", () => {
    const meta = getExpertiseMeta(56)
    expect(meta.name).toBe("Rampage")
    expect(meta.chain?.length).toBe(4)
    // catm-like maxed sources (stored points)
    const base = new Map<number, number>([
      [0, 900_000],
      [1, 700_000],
      [2, 700_000],
      [35, 900_000],
    ])
    const pts = computeChainExpertisePoints(56, base)
    expect(pts).toBe(
      Math.trunc(900_000 * 0.2) +
        Math.trunc(700_000 * 0.2) +
        Math.trunc(700_000 * 0.2) +
        Math.trunc(900_000 * 0.4)
    )
    const prog = parseExpertiseProgress(pts, meta.maxClass, meta.maxRank)
    expect(prog.classLevel).toBe(8)
    expect(prog.rank).toBe(2)
  })

  it("returns 0 for Rampage when a source rank requirement fails", () => {
    const pts = computeChainExpertisePoints(56, {
      0: 100_000, // C1 — below req rank 20
      1: 700_000,
      2: 700_000,
      35: 900_000,
    })
    expect(pts).toBe(0)
  })
})
