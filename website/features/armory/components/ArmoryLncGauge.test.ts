import { describe, expect, it } from "vitest"

import { lncAlignment } from "@/features/armory/components/ArmoryLncGauge"

describe("lncAlignment", () => {
  it("matches server Law / Neutral / Chaos thresholds", () => {
    expect(lncAlignment(-10000)).toBe("Law")
    expect(lncAlignment(-5000)).toBe("Law")
    expect(lncAlignment(-4999)).toBe("Neutral")
    expect(lncAlignment(0)).toBe("Neutral")
    expect(lncAlignment(4500)).toBe("Neutral") // e.g. catm-style
    expect(lncAlignment(-4500)).toBe("Neutral")
    expect(lncAlignment(5000)).toBe("Chaos")
    expect(lncAlignment(10000)).toBe("Chaos")
  })
})
