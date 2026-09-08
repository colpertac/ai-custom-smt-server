import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { applyGlobalReportItemToDrops } from "./report-reward-normalize.ts"
import type { BossCrateDrop } from "./report-reward-types.ts"

describe("applyGlobalReportItemToDrops", () => {
  it("updates tradable item id and label", () => {
    const drops: BossCrateDrop[] = [
      {
        itemId: 38172,
        label: "Dungeon report",
        minStack: 100,
        maxStack: 100,
        rate: 100,
        tradableForCp: true,
      },
      {
        itemId: 700,
        label: "Gem",
        minStack: 1,
        maxStack: 2,
        rate: 50,
      },
    ]
    const next = applyGlobalReportItemToDrops(
      drops,
      38172,
      99999,
      "Clear token"
    )
    assert.deepEqual(next, [
      {
        itemId: 99999,
        label: "Clear token",
        minStack: 100,
        maxStack: 100,
        rate: 100,
        tradableForCp: true,
      },
      {
        itemId: 700,
        label: "Gem",
        minStack: 1,
        maxStack: 2,
        rate: 50,
        tradableForCp: false,
      },
    ])
  })

  it("removes leftover old report id when a new tradable already exists", () => {
    const drops: BossCrateDrop[] = [
      {
        itemId: 38172,
        label: "Old",
        minStack: 100,
        maxStack: 100,
        rate: 100,
      },
      {
        itemId: 99999,
        label: "New",
        minStack: 50,
        maxStack: 50,
        rate: 100,
        tradableForCp: true,
      },
    ]
    const next = applyGlobalReportItemToDrops(
      drops,
      38172,
      99999,
      "Clear token"
    )
    assert.equal(next.length, 1)
    assert.deepEqual(next[0], {
      itemId: 99999,
      label: "Clear token",
      minStack: 50,
      maxStack: 50,
      rate: 100,
      tradableForCp: true,
    })
  })

  it("renames in place when only the label changes", () => {
    const drops: BossCrateDrop[] = [
      {
        itemId: 38172,
        label: "Dungeon report",
        minStack: 123,
        maxStack: 123,
        rate: 100,
        tradableForCp: true,
      },
    ]
    const next = applyGlobalReportItemToDrops(
      drops,
      38172,
      38172,
      "Dungeon Report"
    )
    assert.deepEqual(next[0], {
      itemId: 38172,
      label: "Dungeon Report",
      minStack: 123,
      maxStack: 123,
      rate: 100,
      tradableForCp: true,
    })
  })
})
