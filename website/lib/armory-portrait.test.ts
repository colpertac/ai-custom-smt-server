import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  appearanceFingerprint,
  decodeEquippedVA,
  portraitFingerprintCanonical,
  resolveArmoryPortrait,
  type PortraitFingerprintInput,
} from "@/lib/armory-portrait"

function sample(over: Partial<PortraitFingerprintInput> = {}): PortraitFingerprintInput {
  return {
    appearance: {
      gender: 0,
      skinType: 101,
      hairType: 6,
      faceType: 5,
      eyeType: 2,
      hairColor: 91,
      leftEyeColor: 42,
      rightEyeColor: 42,
    },
    title: 0,
    equippedVA: [
      { slot: 3, itemType: 23602 },
      { slot: 24, itemType: 2004 },
    ],
    weaponType: 0,
    demonType: 0,
    ...over,
  }
}

describe("decodeEquippedVA", () => {
  it("decodes count + slot/itemType pairs", () => {
    const buf = Buffer.alloc(4 + 5 * 2)
    buf.writeUInt32LE(2, 0)
    buf.writeUInt8(3, 4)
    buf.writeUInt32LE(23602, 5)
    buf.writeUInt8(24, 9)
    buf.writeUInt32LE(2004, 10)
    expect(decodeEquippedVA(buf)).toEqual([
      { slot: 3, itemType: 23602 },
      { slot: 24, itemType: 2004 },
    ])
  })

  it("returns empty for missing or short blobs", () => {
    expect(decodeEquippedVA(null)).toEqual([])
    expect(decodeEquippedVA(Buffer.alloc(0))).toEqual([])
  })
})

describe("appearanceFingerprint", () => {
  it("is stable for the same input", () => {
    expect(appearanceFingerprint(sample())).toBe(appearanceFingerprint(sample()))
    expect(appearanceFingerprint(sample())).toMatch(/^[0-9a-f]{16}$/)
  })

  it("does not depend on VA pair order", () => {
    const a = sample({
      equippedVA: [
        { slot: 24, itemType: 2004 },
        { slot: 3, itemType: 23602 },
      ],
    })
    const b = sample()
    expect(appearanceFingerprint(a)).toBe(appearanceFingerprint(b))
  })

  it("changes when VA, weapon, or hair color changes (not demon)", () => {
    const base = appearanceFingerprint(sample())
    expect(
      appearanceFingerprint(sample({ equippedVA: [{ slot: 3, itemType: 1 }] }))
    ).not.toBe(base)
    expect(appearanceFingerprint(sample({ weaponType: 2001 }))).not.toBe(base)
    // Partner demon is not in portraits — summon state must not change the hash.
    expect(appearanceFingerprint(sample({ demonType: 99 }))).toBe(base)
    expect(
      appearanceFingerprint(
        sample({
          appearance: { ...sample().appearance, hairColor: 1 },
        })
      )
    ).not.toBe(base)
  })

  it("canonical string is explicit and versioned", () => {
    expect(portraitFingerprintCanonical(sample())).toContain("v1|")
    expect(portraitFingerprintCanonical(sample())).toContain("va=3:23602,24:2004")
  })
})

describe("resolveArmoryPortrait", () => {
  it("falls back to name-keyed cat2.png when no hash file exists", () => {
    const p = path.join(process.cwd(), "public", "armory", "portraits", "cat2.png")
    if (!fs.existsSync(p)) return
    const r = resolveArmoryPortrait(sample(), "cat2")
    expect(r.status).toBe("ready")
    expect(r.url).toBe("/armory/portraits/cat2.png")
    expect(r.fingerprint).toMatch(/^[0-9a-f]{16}$/)
  })

  it("returns missing when neither hash nor name file exists", () => {
    const r = resolveArmoryPortrait(sample(), "no-such-portrait-zzzz")
    expect(r.status).toBe("missing")
    expect(r.url).toBeNull()
  })
})
