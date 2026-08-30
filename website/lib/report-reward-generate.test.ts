import { describe, expect, it } from "vitest"

import {
  buildReportRewardsPackageFiles,
  generateAppendDropSetsXml,
  generateReportTradeEventsXml,
  validateAppendDropSets,
} from "./report-reward-generate.ts"
import {
  CUSTOM_CHOICE_MESSAGE_ID_MIN,
  linearTradeTiers,
  resolveTradeTiersWithMessages,
} from "./report-reward-types.ts"
import type {
  ReportRewardDungeon,
  ReportRewardGlobal,
} from "./report-reward-types.ts"

const global: ReportRewardGlobal = {
  reportItemId: 900001,
  eventPrefix: "AI_REPORT_TRADE",
  greetMessageId: 1,
  promptMessageId: 2,
  endMessageId: 3,
  itemsPerCp: 10,
  cpPackages: [1, 5, 10, 50, 100],
  traders: [],
}

const trader = {
  label: "Test",
  dynamicMapId: 20101,
  npcId: 1,
  x: 0,
  y: 0,
  rotation: 0,
}

describe("report-reward-generate", () => {
  it("emits APPEND dropset for enabled dungeon", () => {
    const dungeons: ReportRewardDungeon[] = [
      {
        id: "mirage-bronze",
        name: "Mirage bronze",
        enabled: true,
        appendDropSetId: 10900,
        drops: [
          {
            itemId: 900001,
            minStack: 100,
            maxStack: 100,
            rate: 100,
            tradableForCp: true,
          },
        ],
      },
    ]
    const xml = generateAppendDropSetsXml(dungeons, global)
    expect(xml).toContain("10900")
    expect(xml).toContain("APPEND")
    expect(xml).toContain("900001")
  })

  it("reconciles shared APPEND crates to canonical drops", () => {
    const dungeons: ReportRewardDungeon[] = [
      {
        id: "suginami-silver",
        name: "Suginami silver",
        enabled: true,
        appendDropSetId: 5520,
        drops: [
          {
            itemId: 900001,
            minStack: 100,
            maxStack: 100,
            rate: 100,
            tradableForCp: true,
          },
        ],
      },
      {
        id: "suginami-per-floor",
        name: "Suginami per floor",
        enabled: true,
        appendDropSetId: 5520,
        drops: [
          {
            itemId: 900001,
            minStack: 50,
            maxStack: 50,
            rate: 100,
            tradableForCp: true,
          },
        ],
      },
    ]
    const warnings = validateAppendDropSets(dungeons, global)
    expect(warnings[0]).toContain("suginami-silver")
    expect(warnings[0]).toContain("suginami-per-floor")
    const xml = generateAppendDropSetsXml(dungeons, global)
    expect(xml).toContain("<member name=\"MinStack\">100</member>")
    expect(xml).not.toContain("<member name=\"MinStack\">50</member>")
  })

  it("builds linear trade packages from itemsPerCp", () => {
    expect(linearTradeTiers(10)).toEqual([
      { cost: 10, cp: 1, choiceMessageId: 130711 },
      { cost: 50, cp: 5, choiceMessageId: 130712 },
      { cost: 100, cp: 10, choiceMessageId: 130713 },
      { cost: 500, cp: 50, choiceMessageId: 130714 },
      { cost: 1000, cp: 100, choiceMessageId: 130715 },
    ])
  })

  it("allocates stable custom message IDs for non-stock costs", () => {
    const first = resolveTradeTiersWithMessages(10, [1, 25], { byCost: {} })
    expect(first.tiers[0]?.choiceMessageId).toBe(130711)
    expect(first.tiers[1]?.cost).toBe(250)
    expect(first.tiers[1]?.choiceMessageId).toBe(CUSTOM_CHOICE_MESSAGE_ID_MIN)
    expect(first.customMessages).toEqual([
      { id: CUSTOM_CHOICE_MESSAGE_ID_MIN, lines: ["250"] },
    ])
    const again = resolveTradeTiersWithMessages(10, [1, 25], first.store)
    expect(again.tiers[1]?.choiceMessageId).toBe(CUSTOM_CHOICE_MESSAGE_ID_MIN)
    expect(again.allocated).toBe(false)
  })

  it("maps choice labels by item cost like jackfrost, not package index", () => {
    expect(linearTradeTiers(1, [10, 50, 100])).toEqual([
      { cost: 10, cp: 10, choiceMessageId: 130711 },
      { cost: 50, cp: 50, choiceMessageId: 130712 },
      { cost: 100, cp: 100, choiceMessageId: 130713 },
    ])
  })

  it("generates linear trade tiers from itemsPerCp", () => {
    const tiers = linearTradeTiers(10)
    const xml = generateReportTradeEventsXml(
      {
        ...global,
        itemsPerCp: 10,
        traders: [trader],
      },
      tiers
    )
    expect(xml).toContain("AI_REPORT_TRADE_T01")
    expect(xml).toContain("AI_REPORT_TRADE_T05")
    expect(xml).toContain("<key>900001</key>")
    expect(xml).toContain("<value>-10</value>")
    expect(xml).toContain("<value>-1000</value>")
    expect(xml).toContain("<member name=\"value\">100</member>")
    expect(xml).toContain("<member name=\"messageID\">606</member>")
    expect(xml).toContain("<member name=\"messageID\">130711</member>")
    expect(xml).toContain("<member name=\"messageID\">130715</member>")
  })

  it("includes custom-cost packages and warns about ImagineUpdate", () => {
    const { files, warnings, customEventMessages } =
      buildReportRewardsPackageFiles(
        [],
        {
          ...global,
          itemsPerCp: 1,
          cpPackages: [1, 10, 50],
          traders: [trader],
        },
        { byCost: {} }
      )
    const xml = files["events/ai_custom_report_trade.xml"] ?? ""
    expect(xml).toContain("<value>-1</value>")
    expect(xml).toContain("<value>-10</value>")
    expect(xml).toContain("<value>-50</value>")
    expect(xml).toContain(`<member name="messageID">${CUSTOM_CHOICE_MESSAGE_ID_MIN}</member>`)
    expect(xml).toContain("<member name=\"messageID\">606</member>")
    expect(customEventMessages.some((m) => m.lines[0] === "1")).toBe(true)
    expect(warnings.some((w) => w.includes("ImagineUpdate"))).toBe(true)
  })
})
