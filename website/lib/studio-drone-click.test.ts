import { describe, expect, it } from "vitest"

import {
  containClickToFrac,
  formatClickFrac,
  fracToContainPercent,
} from "@/lib/studio-drone-click"

describe("containClickToFrac", () => {
  const letterboxed = {
    naturalWidth: 1440,
    naturalHeight: 900,
    clientWidth: 800,
    clientHeight: 600,
  }

  it("maps a center click through object-contain letterbox", () => {
    // scale = min(800/1440, 600/900) = min(0.555…, 0.666…) = 0.555…
    // displayed 800 × 500, top offset 50
    const frac = containClickToFrac(400, 50 + 250, letterboxed)
    expect(frac).not.toBeNull()
    expect(frac!.xFrac).toBeCloseTo(0.5, 3)
    expect(frac!.yFrac).toBeCloseTo(0.5, 3)
  })

  it("rejects clicks in the letterbox", () => {
    expect(containClickToFrac(400, 10, letterboxed)).toBeNull()
    expect(containClickToFrac(400, 590, letterboxed)).toBeNull()
  })

  it("maps top-left of the photo to ~0,0", () => {
    const frac = containClickToFrac(0, 50, letterboxed)
    expect(frac).not.toBeNull()
    expect(frac!.xFrac).toBeCloseTo(0, 3)
    expect(frac!.yFrac).toBeCloseTo(0, 3)
  })

  it("round-trips a frac to CSS percent", () => {
    const frac = { xFrac: 0.051, yFrac: 0.937 }
    const pct = fracToContainPercent(frac, letterboxed)
    expect(pct).not.toBeNull()
    const back = containClickToFrac(
      (pct!.leftPct / 100) * letterboxed.clientWidth,
      (pct!.topPct / 100) * letterboxed.clientHeight,
      letterboxed
    )
    expect(back!.xFrac).toBeCloseTo(0.051, 3)
    expect(back!.yFrac).toBeCloseTo(0.937, 3)
  })

  it("formats fracs for the queue label", () => {
    expect(formatClickFrac({ xFrac: 0.05127, yFrac: 0.936719 })).toBe(
      "0.051, 0.937"
    )
  })
})
