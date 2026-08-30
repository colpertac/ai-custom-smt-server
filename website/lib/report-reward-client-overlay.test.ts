import { describe, expect, it } from "vitest"

import {
  buildClientOverlayInstallReadme,
  resolveClientOverlayFromGlobal,
} from "@/lib/report-reward-client-overlay"
import type { ReportRewardGlobalFile } from "@/lib/report-reward-types"

const globalWithCustomPackage: ReportRewardGlobalFile = {
  version: 1,
  global: {
    reportItemId: 900001,
    eventPrefix: "AI_REPORT_TRADE",
    greetMessageId: 1183186,
    promptMessageId: 1183186,
    endMessageId: 3411,
    itemsPerCp: 1,
    cpPackages: [1],
    traders: [],
  },
}

describe("report-reward client overlay", () => {
  it("detects custom package when item cost is not stock", () => {
    const resolved = resolveClientOverlayFromGlobal(globalWithCustomPackage, {
      byCost: {},
    })
    expect(resolved.missingStock).toEqual([{ cost: 1, cp: 1 }])
    expect(resolved.customMessages).toHaveLength(1)
    expect(resolved.customMessages[0]?.lines).toEqual(["1"])
  })

  it("readme mentions game install path", () => {
    const text = buildClientOverlayInstallReadme({
      messages: [{ id: 9180000, lines: ["1"] }],
      missingStock: [{ cost: 1, cp: 1 }],
      overlayWritten: true,
    })
    expect(text).toContain("BinaryData/Shield/CEventMessageData2.sbin")
    expect(text).toContain("ImagineClient.exe")
    expect(text).toContain("9180000")
  })
})
