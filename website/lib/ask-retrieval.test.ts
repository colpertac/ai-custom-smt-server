import { describe, expect, it } from "vitest"

import {
  matchItemFromQuery,
  retrieveAskAnswer,
  searchQuests,
} from "@/lib/ask-retrieval"

describe("ask-retrieval", () => {
  it("matches guard's desire to quest 5", () => {
    const matches = searchQuests("how do I complete the guard's desire")
    expect(matches[0]?.id).toBe(5)
    expect(matches[0]?.title).toBe("The Guard's Desire")
    expect(matches[0]?.score).toBeGreaterThan(10)
  })

  it("matches guards desire without apostrophe", () => {
    const matches = searchQuests("guards desire")
    expect(matches[0]?.id).toBe(5)
  })

  it("matches quest id shorthand", () => {
    const matches = searchQuests("quest 5")
    expect(matches[0]?.id).toBe(5)
    expect(matches[0]?.score).toBeGreaterThanOrEqual(1000)
  })

  it("returns cited knowledge note for Guard's Desire", () => {
    const result = retrieveAskAnswer(
      "how do I complete the guard's desire?"
    )
    expect(result.ok).toBe(true)
    expect(result.answer).toMatch(/Home III/i)
    expect(result.answer).toMatch(/Father Figure Guard/i)
    expect(result.answer).toMatch(/Cathedral/i)
    expect(result.answer).toMatch(/Home Point Girl/i)
    expect(result.citations.some((c) => c.kind === "knowledge")).toBe(true)
    expect(result.citations.some((c) => c.ref.includes("quests.json#5"))).toBe(
      true
    )
  })

  it("returns not in catalog for unknown topics", () => {
    const result = retrieveAskAnswer(
      "how do I complete the zzznonexistent quest qqqq"
    )
    expect(result.ok).toBe(false)
    expect(result.answer).toMatch(/not in the quest or item catalog/i)
  })

  it("matches High-Grade Ointment from acquisition query", () => {
    const match = matchItemFromQuery("where do I get High-Grade Ointment")
    expect(match?.id).toBe(2)
    expect(match?.name).toBe("High-Grade Ointment")
    expect(match?.score).toBeGreaterThan(50)
  })

  it("returns drop zones for item acquisition queries", () => {
    const result = retrieveAskAnswer("where do I farm High-Grade Ointment?")
    expect(result.ok).toBe(true)
    expect(result.answer).toMatch(/High-Grade Ointment/i)
    expect(result.answer).toMatch(/Suginami \(30101\)/i)
    expect(result.citations.some((c) => c.kind === "item-sources")).toBe(true)
    expect(
      result.citations.some((c) => c.ref.includes("item-sources.json#2"))
    ).toBe(true)
  })

  it("answers what enemies drop Tarunda Stone", () => {
    const result = retrieveAskAnswer("What enemies drop Tarunda Stone?")
    expect(result.ok).toBe(true)
    expect(result.answer).toMatch(/Tarunda Stone/i)
    expect(result.answer).toMatch(/enemy drop/i)
    expect(result.citations.some((c) => c.kind === "item-sources")).toBe(true)
    expect(
      result.citations.some((c) => c.ref.includes("item-sources.json#166"))
    ).toBe(true)
  })

  it("answers how do I get Tarunda Stone", () => {
    const result = retrieveAskAnswer("How do I get Tarunda Stone?")
    expect(result.ok).toBe(true)
    expect(result.answer).toMatch(/Tarunda Stone/i)
    expect(result.citations.some((c) => c.ref.includes("item-sources.json#166"))).toBe(
      true
    )
  })

  it("appends item drop sources for quests with ITEM requirements", () => {
    const result = retrieveAskAnswer("how do I complete Understanding Plasma?")
    expect(result.ok).toBe(true)
    expect(result.answer).toMatch(/Understanding Plasma/i)
    expect(result.answer).toMatch(/Where to get quest items/i)
    expect(result.answer).toMatch(/Empty Can: Oolong Tea/i)
    expect(result.answer).toMatch(/Suginami \(30101\)/i)
    expect(result.citations.some((c) => c.kind === "item-sources")).toBe(true)
  })
})
