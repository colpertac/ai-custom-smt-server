import { describe, expect, it } from "vitest"

import { getQuestById } from "@/lib/quest-catalog-load"
import {
  buildQuestWalkthrough,
  listWikiQuestRows,
  mapJournalToPhases,
} from "@/lib/wiki-quest-guide"

describe("mapJournalToPhases", () => {
  it("maps lines in order and joins hard wraps", () => {
    const map = mapJournalToPhases([
      "<qdetail:qid_005_p01_01.dds>\nVisit the Cathedral\nof Shadows.",
      "Report back.",
    ])
    expect([...map.entries()]).toEqual([
      [0, "Visit the Cathedral of Shadows."],
      [1, "Report back."],
    ])
  })

  it("re-anchors on hint image phase numbers", () => {
    const map = mapJournalToPhases([
      "First.",
      "<qdetail:qid_303_p08_01.dds>\nReport back to Snakeman.",
    ])
    expect(map.get(0)).toBe("First.")
    expect(map.get(7)).toBe("Report back to Snakeman.")
  })
})

describe("buildQuestWalkthrough", () => {
  it("builds The Guard's Desire like the community wiki page", () => {
    const quest = getQuestById(5)!
    const w = buildQuestWalkthrough(quest)

    expect(w.hasGuide).toBe(true)
    expect(w.giver).toBe("Father Figure Guard")
    expect(w.location).toBe("Home III")
    expect(w.coords).toEqual({ x: 16, y: 19 })
    expect(w.steps.map((s) => s.kind)).toEqual([
      "start",
      "objective",
      "objective",
      "objective",
      "complete",
    ])
    expect(w.steps[1].journal).toMatch(/^Visit the Cathedral of Shadows/)
    expect(w.steps[1].routes[0].targets[0].label).toBe(
      "Master of the Cathedral"
    )
    expect(w.steps[2].routes[0].gains[0]).toMatchObject({
      label: "Important Letter from a Guard",
      href: "/wiki/items/5216",
    })
    expect(w.steps[3].routes[0].losses[0].label).toBe(
      "Important Letter from a Guard"
    )
    expect(w.rewards[0]).toMatchObject({
      label: "Traesto Stone",
      count: 3,
      href: "/wiki/items/231",
    })
    expect(w.unlocks.map((u) => u.href)).toContain("/wiki/quests/593")
  })

  it("names the boss on spawn-defeat steps", () => {
    const w = buildQuestWalkthrough(getQuestById(303)!)
    const eligor = w.steps.find((s) =>
      s.routes.some((r) => r.targets.some((t) => t.label === "Eligor"))
    )
    expect(eligor?.routes[0].verb).toBe("Defeat")
    expect(w.prerequisites.map((p) => p.label)).toEqual(["Act 3: The Raid"])
    expect(w.steps.at(-1)?.journal).toBe("Report back to Snakeman.")
  })

  it("gives map coordinates and per-card orders for Act 12", () => {
    const w = buildQuestWalkthrough(getQuestById(311)!)
    const [, toControlRoom, reactor] = w.steps

    expect(toControlRoom.routes[0].grid).toEqual({ x: 12, y: 25 })
    expect(reactor.routes.map((r) => r.when)).toEqual([
      "If DB Saito gives you Blue Card",
      "If DB Saito gives you Yellow Card",
      "If DB Saito gives you White Card",
      "If DB Saito gives you Black Card",
    ])
    const blue = reactor.routes[0].sequence
    expect(blue.map((t) => t.grid)).toEqual([
      { x: 18, y: 29 },
      { x: 24, y: 36 },
    ])
    expect(blue[1].choices).toEqual([
      "Insert Blue Card",
      "Insert Yellow Card",
      "Insert Black Card",
      "Insert Red Card",
      "Insert White Card",
    ])
  })

  it("folds Act 12's four card routes into one order table", () => {
    const reactor = buildQuestWalkthrough(getQuestById(311)!).steps[2]
    const table = reactor.table!
    expect(table.prefix).toBe("Insert")
    expect(table.suffix).toBe("Card")
    expect(table.talks[table.orderAt].grid).toEqual({ x: 24, y: 36 })
    expect(table.rows.map((r) => [r.when[0].label, r.order.join(" ")])).toEqual(
      [
        ["Blue Card", "Blue Yellow Black Red White"],
        ["Yellow Card", "Yellow Black Red White Blue"],
        ["White Card", "White Yellow Red Blue Black"],
        ["Black Card", "Black White Yellow Red Blue"],
      ]
    )
  })

  it("falls back to journal-only steps when no event script exists", () => {
    const row = listWikiQuestRows().find((r) => !r.hasGuide)!
    const w = buildQuestWalkthrough(getQuestById(row.id)!)
    expect(w.hasGuide).toBe(false)
    expect(w.steps.every((s) => s.routes.length === 0)).toBe(true)
  })
})
