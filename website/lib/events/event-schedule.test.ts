import { describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"

import {
  conflictsInActiveSet,
  validateSchedule,
} from "./event-conflicts"
import {
  activeLoopDayIndex,
  activeScheduleDateKey,
  computeDesiredActiveIds,
  expandUpcomingSlots,
  flipInstantOnDate,
  migrateV1ToV2,
  nextFlipInstant,
  mostRecentFlipInstant,
  nextScheduleChangeAt,
  setsEqual,
} from "./event-schedule-math"
import type { EventScheduleConfig, EventScheduleConfigV1 } from "./types"

const known = [
  "201506_wonder",
  "201501_ordeal",
  "201506_sage",
  "201510_halloween",
  "201307_summer",
]

function baseConfig(
  overrides: Partial<EventScheduleConfig> = {}
): EventScheduleConfig {
  return {
    version: 2,
    enabled: true,
    mode: "loop",
    timezone: "UTC",
    flipTime: "04:00",
    alwaysOnIds: ["201506_wonder"],
    loop: {
      anchorDate: "2026-09-01",
      days: [
        { id: "d1", eventIds: ["201510_halloween"] },
        { id: "d2", eventIds: ["201307_summer"] },
        { id: "d3", eventIds: [] },
      ],
    },
    calendar: { days: [] },
    ...overrides,
  }
}

describe("event-schedule-math v2", () => {
  it("picks schedule date key relative to flip time", () => {
    // 2026-09-02 03:00 UTC — before 04:00 flip → still 2026-09-01
    const before = activeScheduleDateKey(
      new Date("2026-09-02T03:00:00.000Z"),
      "04:00",
      "UTC"
    )
    expect(before).toBe("2026-09-01")

    const after = activeScheduleDateKey(
      new Date("2026-09-02T05:00:00.000Z"),
      "04:00",
      "UTC"
    )
    expect(after).toBe("2026-09-02")
  })

  it("rotates loop day index and wraps", () => {
    const config = baseConfig()
    // Day 0: Sep 1 after flip
    expect(
      activeLoopDayIndex(config, new Date("2026-09-01T12:00:00.000Z"))
    ).toBe(0)
    // Day 1: Sep 2
    expect(
      activeLoopDayIndex(config, new Date("2026-09-02T12:00:00.000Z"))
    ).toBe(1)
    // Day 2 empty: Sep 3
    expect(
      activeLoopDayIndex(config, new Date("2026-09-03T12:00:00.000Z"))
    ).toBe(2)
    // Wrap to day 0: Sep 4
    expect(
      activeLoopDayIndex(config, new Date("2026-09-04T12:00:00.000Z"))
    ).toBe(0)
  })

  it("wraps loop index when today is before the Loop day 1 date", () => {
    const config = baseConfig({
      loop: {
        anchorDate: "2026-09-07",
        days: [
          { id: "d1", eventIds: ["201510_halloween"] },
          { id: "d2", eventIds: ["201307_summer"] },
          { id: "d3", eventIds: [] },
        ],
      },
    })
    // Sep 6 is one day before Day 1 → last day in the cycle (index 2)
    expect(
      activeLoopDayIndex(config, new Date("2026-09-06T12:00:00.000Z"))
    ).toBe(2)
    expect(
      computeDesiredActiveIds(config, new Date("2026-09-06T12:00:00.000Z"))
    ).toEqual(["201506_wonder"])
    // Sep 7 → Day 1
    expect(
      activeLoopDayIndex(config, new Date("2026-09-07T12:00:00.000Z"))
    ).toBe(0)
  })

  it("computes desired ids including empty alternating days", () => {
    const config = baseConfig()
    expect(
      computeDesiredActiveIds(config, new Date("2026-09-01T12:00:00.000Z"))
    ).toEqual(["201506_wonder", "201510_halloween"])

    expect(
      computeDesiredActiveIds(config, new Date("2026-09-03T12:00:00.000Z"))
    ).toEqual(["201506_wonder"])
  })

  it("uses calendar day assignments in calendar mode", () => {
    const config = baseConfig({
      mode: "calendar",
      calendar: {
        days: [
          { date: "2026-09-06", eventIds: ["201307_summer"] },
        ],
      },
    })
    expect(
      computeDesiredActiveIds(config, new Date("2026-09-06T12:00:00.000Z"))
    ).toEqual(["201307_summer", "201506_wonder"])
    expect(
      computeDesiredActiveIds(config, new Date("2026-09-07T12:00:00.000Z"))
    ).toEqual(["201506_wonder"])
  })

  it("expands upcoming loop slots", () => {
    const config = baseConfig()
    const slots = expandUpcomingSlots(
      config,
      new Date("2026-09-01T12:00:00.000Z"),
      new Date("2026-09-05T12:00:00.000Z")
    )
    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0].dayKey).toMatch(/^loop-/)
  })

  it("reports next flip change", () => {
    const config = baseConfig()
    const next = nextScheduleChangeAt(
      config,
      new Date("2026-09-01T12:00:00.000Z")
    )
    expect(next).toBeTruthy()
    expect(Date.parse(next!)).toBeGreaterThan(
      Date.parse("2026-09-01T12:00:00.000Z")
    )
  })

  it("nextFlipInstant is the next wall-clock flip (restart time)", () => {
    const config = baseConfig({ timezone: "UTC", flipTime: "16:26" })
    const before = nextFlipInstant(
      config,
      new Date("2026-09-06T16:20:00.000Z")
    )
    expect(before.toISOString()).toBe("2026-09-06T16:26:00.000Z")

    const after = nextFlipInstant(
      config,
      new Date("2026-09-06T16:26:00.000Z")
    )
    expect(after.toISOString()).toBe("2026-09-07T16:26:00.000Z")
  })

  it("mostRecentFlipInstant is the flip at or before now", () => {
    const config = baseConfig({ timezone: "UTC", flipTime: "16:26" })
    const before = mostRecentFlipInstant(
      config,
      new Date("2026-09-06T16:20:00.000Z")
    )
    expect(before.toISOString()).toBe("2026-09-05T16:26:00.000Z")

    const after = mostRecentFlipInstant(
      config,
      new Date("2026-09-06T16:30:00.000Z")
    )
    expect(after.toISOString()).toBe("2026-09-06T16:26:00.000Z")
  })

  it("migrates v1 windows to v2 loop days", () => {
    const v1: EventScheduleConfigV1 = {
      version: 1,
      enabled: true,
      timezone: "UTC",
      alwaysOnIds: ["201506_wonder"],
      loop: {
        cycleDays: 3,
        anchorAt: "2026-09-01T04:00:00.000Z",
      },
      windows: [
        {
          id: randomUUID(),
          eventIds: ["201510_halloween"],
          startOffsetMinutes: 0,
          endOffsetMinutes: 24 * 60,
        },
      ],
    }
    const v2 = migrateV1ToV2(v1)
    expect(v2.version).toBe(2)
    expect(v2.mode).toBe("loop")
    expect(v2.loop.days[0]?.eventIds).toContain("201510_halloween")
  })

  it("compares id sets", () => {
    expect(setsEqual(["a", "b"], ["b", "a"])).toBe(true)
    expect(setsEqual(["a"], ["a", "b"])).toBe(false)
  })

  it("builds flip instants on a date", () => {
    const d = flipInstantOnDate("2026-09-01", "04:00", "UTC")
    expect(d.toISOString()).toBe("2026-09-01T04:00:00.000Z")
  })
})

describe("event-conflicts v2", () => {
  it("rejects ordeal + sage on the same loop day", () => {
    const result = validateSchedule(
      baseConfig({
        loop: {
          anchorDate: "2026-09-01",
          days: [
            {
              id: "bad",
              eventIds: ["201501_ordeal", "201506_sage"],
            },
          ],
        },
      }),
      { knownEventIds: known }
    )
    expect(result.ok).toBe(false)
    expect(result.conflicts.some((c) => c.groupId === "thoth-babel-home")).toBe(
      true
    )
  })

  it("allows empty days and ordeal alone", () => {
    const result = validateSchedule(
      baseConfig({
        loop: {
          anchorDate: "2026-09-01",
          days: [
            { id: "a", eventIds: ["201501_ordeal"] },
            { id: "b", eventIds: [] },
          ],
        },
      }),
      { knownEventIds: known }
    )
    expect(result.ok).toBe(true)
  })

  it("detects conflicts in a concrete active set", () => {
    const hits = conflictsInActiveSet([
      "201501_ordeal",
      "201506_sage",
      "201506_wonder",
    ])
    expect(hits.length).toBe(1)
  })
})
