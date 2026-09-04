import { describe, expect, it } from "vitest"

import { DEFAULT_SITE_NAME, splitSiteName } from "@/lib/website-branding"

describe("splitSiteName", () => {
  it("keeps last word as accent for multi-word names", () => {
    expect(splitSiteName("Imagine Private")).toEqual({
      lead: "Imagine",
      accent: "Private",
    })
  })

  it("uses whole name as accent for single word", () => {
    expect(splitSiteName("ReIMAGINE")).toEqual({
      lead: "",
      accent: "ReIMAGINE",
    })
  })

  it("falls back to default when empty", () => {
    expect(splitSiteName("   ")).toEqual(splitSiteName(DEFAULT_SITE_NAME))
  })
})
