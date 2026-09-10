import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  buildDenseArchiveCycle,
  buildLifecycleConflictGroups,
  buildSpotConflictGroups,
  denseArchiveAsProfile,
} from "./dense-archive-cycle"
import { findConflictInSet } from "./event-conflicts"
import type { CompEvent } from "./types"

function loadCatalogEvents(): CompEvent[] {
  const p = path.resolve(
    process.cwd(),
    "content/events/events-catalog.json"
  )
  const raw = JSON.parse(readFileSync(p, "utf8")) as { events: CompEvent[] }
  return raw.events
}

describe("dense-archive-cycle", () => {
  it("builds spot and lifecycle soft groups", () => {
    const events = loadCatalogEvents()
    const spots = buildSpotConflictGroups(events)
    expect(spots.length).toBeGreaterThan(0)
    const life = buildLifecycleConflictGroups(events.map((e) => e.id))
    expect(life.some((g) => g.eventIds.includes("201006_momoiro"))).toBe(true)
  })

  it("packs catalog without same-day hard/soft/lifecycle conflicts", () => {
    const events = loadCatalogEvents()
    const result = buildDenseArchiveCycle(events)
    expect(result.alwaysOnIds).toEqual(
      expect.arrayContaining(["201506_wonder", "201604_misc"])
    )
    expect(result.alwaysOnIds).toHaveLength(2)
    expect(result.days.length).toBeGreaterThanOrEqual(7)
    expect(result.days.length).toBeLessThanOrEqual(40)

    const rotating = new Set<string>()
    for (const d of result.days) {
      for (const id of d.eventIds) {
        expect(rotating.has(id)).toBe(false)
        rotating.add(id)
      }
    }
    expect(rotating.has("all_halloween")).toBe(false)
    expect(rotating.has("201604_misc")).toBe(false)
    expect(rotating.has("201506_wonder")).toBe(false)

    const soft = [
      ...buildSpotConflictGroups(events),
      ...buildLifecycleConflictGroups(events.map((e) => e.id)),
    ]
    for (const d of result.days) {
      const hit = findConflictInSet(d.eventIds, soft)
      expect(hit).toBeNull()
    }

    // kappa1 weather glued when kappa1 present
    const k1 = result.days.find((d) => d.eventIds.includes("201006_kappa1"))
    expect(k1?.eventIds).toContain("201006_kappa1_weather")
  })

  it("exposes builtin profile shape", () => {
    const profile = denseArchiveAsProfile(loadCatalogEvents(), "2026-01-01T00:00:00.000Z")
    expect(profile.builtin).toBe(true)
    expect(profile.id).toBe("builtin:dense-archive")
    expect(profile.days[0]?.id).toBeTruthy()
  })

  it("clone-safe day ids differ from source when remapped", () => {
    const a = randomUUID()
    const days = [{ id: a, eventIds: ["x"] }]
    const cloned = days.map((d) => ({ id: randomUUID(), eventIds: [...d.eventIds] }))
    expect(cloned[0]!.id).not.toBe(a)
  })
})
