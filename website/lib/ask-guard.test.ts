import { describe, expect, it } from "vitest"

import {
  ASK_MAX_QUERY_LENGTH,
  ASK_REFUSAL_MESSAGE,
  isRefusedAskQuery,
} from "@/lib/ask-guard"

describe("ask-guard", () => {
  it("refuses account/password style questions", () => {
    expect(isRefusedAskQuery("how to hack an account")).toBe(true)
    expect(isRefusedAskQuery("steal someone's password")).toBe(true)
    expect(isRefusedAskQuery("sql injection on login")).toBe(true)
  })

  it("allows normal quest questions", () => {
    expect(isRefusedAskQuery("how do I complete guard's desire")).toBe(false)
  })

  it("exports refusal copy and max length", () => {
    expect(ASK_REFUSAL_MESSAGE).toMatch(/account/i)
    expect(ASK_MAX_QUERY_LENGTH).toBeGreaterThan(100)
  })
})
