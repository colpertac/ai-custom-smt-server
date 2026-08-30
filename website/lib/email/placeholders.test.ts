import { describe, expect, it } from "vitest"

import {
  displayEmail,
  isPlaceholderEmail,
  placeholderEmail,
} from "@/lib/email/placeholders"

describe("email placeholders", () => {
  it("builds a unique noreply placeholder per username", () => {
    expect(placeholderEmail("Alice")).toBe("noreply+alice@local.invalid")
  })

  it("detects placeholders case-insensitively", () => {
    expect(isPlaceholderEmail("noreply+alice@local.invalid", "alice")).toBe(
      true
    )
    expect(isPlaceholderEmail(null, "alice")).toBe(true)
    expect(isPlaceholderEmail("a@b.com", "alice")).toBe(false)
    expect(isPlaceholderEmail("admin@comp_hack.github.com", "admin")).toBe(
      true
    )
  })

  it("displayEmail blanks placeholders for the UI", () => {
    expect(displayEmail("noreply+alice@local.invalid", "alice")).toBe("")
    expect(displayEmail("a@b.com", "alice")).toBe("a@b.com")
  })
})
