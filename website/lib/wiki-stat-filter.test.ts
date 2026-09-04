import { describe, expect, it } from "vitest"

import { searchWikiCatalog } from "@/content/wiki"

describe("searchWikiCatalog stat filter", () => {
  it("finds Bottom gear with COOLDOWN_TIME in S2/S3", () => {
    const r = searchWikiCatalog("", {
      category: "armor",
      slot: "Bottom",
      stat: "COOLDOWN_TIME",
      limit: 5,
    })
    expect(r.total).toBeGreaterThan(0)
    for (const item of r.items) {
      const rows = [
        ...(item.basicFeatures ?? []),
        ...(item.characteristics ?? []),
      ]
      expect(rows.some((s) => s.id === "COOLDOWN_TIME")).toBe(true)
    }
  })
})
