import { describe, expect, it } from "vitest"

import {
  decodeEquippedVA,
  portraitFilePath,
  resolveHashedPortrait,
} from "@/lib/armory-portrait"

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

describe("resolveHashedPortrait", () => {
  it("returns missing when no hash file exists (or no fingerprint)", () => {
    const r = resolveHashedPortrait("ffffffffffffffff")
    expect(r).toEqual({ fingerprint: "ffffffffffffffff", url: null, status: "missing" })
    expect(resolveHashedPortrait("").status).toBe("missing")
  })
})

describe("portraitFilePath", () => {
  it("rejects traversal and missing files", () => {
    expect(portraitFilePath("../secret.png")).toBeNull()
    expect(portraitFilePath("no-such-portrait-zzzz.png")).toBeNull()
  })
})
