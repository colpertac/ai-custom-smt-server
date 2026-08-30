import { describe, expect, it } from "vitest"

import {
  loginSchema,
  passwordSchema,
  usernameSchema,
} from "@/features/auth/schemas/login.schema"

describe("usernameSchema", () => {
  it("accepts valid usernames and lowercases", () => {
    expect(usernameSchema.parse("Alice1")).toBe("alice1")
    expect(usernameSchema.parse("test")).toBe("test")
  })

  it("rejects too short, leading digit, or symbols", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false)
    expect(usernameSchema.safeParse("1abc").success).toBe(false)
    expect(usernameSchema.safeParse("ab_cd").success).toBe(false)
  })
})

describe("passwordSchema", () => {
  it("accepts allowed COMP password charset", () => {
    expect(passwordSchema.parse("secret1")).toBe("secret1")
    expect(passwordSchema.safeParse("Abc123!@").success).toBe(true)
  })

  it("rejects too short or illegal characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false)
    expect(passwordSchema.safeParse("has space").success).toBe(false)
  })
})

describe("loginSchema", () => {
  it("parses a valid login payload", () => {
    const parsed = loginSchema.parse({
      username: "WebTest",
      password: "hunter2",
    })
    expect(parsed).toEqual({ username: "webtest", password: "hunter2" })
  })

  it("fails when username or password invalid", () => {
    expect(
      loginSchema.safeParse({ username: "x", password: "hunter2" }).success
    ).toBe(false)
    expect(
      loginSchema.safeParse({ username: "webtest", password: "no" }).success
    ).toBe(false)
  })
})
