import { describe, expect, it } from "vitest"

import {
  decodeU8S32Map,
  decodeU8S8Map,
  encodeU8S32Map,
  encodeU8S8Map,
} from "@/lib/digitalize-map"

describe("digitalize-map", () => {
  it("round-trips empty maps", () => {
    const empty = new Map<number, number>()
    expect(decodeU8S8Map(encodeU8S8Map(empty)).size).toBe(0)
    expect(decodeU8S32Map(encodeU8S32Map(empty)).size).toBe(0)
    expect(encodeU8S8Map(empty).equals(Buffer.alloc(4))).toBe(true)
  })

  it("round-trips level pairs", () => {
    const levels = new Map<number, number>([
      [2, 1],
      [13, 10],
      [101, 5],
    ])
    const decoded = decodeU8S8Map(encodeU8S8Map(levels))
    expect([...decoded.entries()]).toEqual([...levels.entries()])
  })

  it("round-trips points pairs", () => {
    const points = new Map<number, number>([
      [13, 24099],
      [101, 99999],
      [112, 0],
    ])
    const decoded = decodeU8S32Map(encodeU8S32Map(points))
    expect([...decoded.entries()]).toEqual([...points.entries()])
  })

  it("decodes live-style levels blob", () => {
    // count=2, race 2 lvl 1, race 54 lvl 1
    const blob = Buffer.from([0x02, 0x00, 0x00, 0x00, 0x02, 0x01, 0x36, 0x01])
    const decoded = decodeU8S8Map(blob)
    expect(decoded.get(2)).toBe(1)
    expect(decoded.get(0x36)).toBe(1)
  })
})
