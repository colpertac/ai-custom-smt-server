import { describe, expect, it } from "vitest"

import { registerSchema } from "@/features/auth/schemas/register.schema"
import { changePasswordSchema } from "@/features/auth/schemas/changePassword.schema"
import { changeEmailSchema } from "@/features/auth/schemas/changeEmail.schema"

describe("registerSchema", () => {
  it("allows empty optional email", () => {
    const parsed = registerSchema.parse({
      username: "newuser",
      email: "",
      password: "hunter2",
      passwordConfirm: "hunter2",
    })
    expect(parsed.email).toBe("")
    expect(parsed.username).toBe("newuser")
  })

  it("accepts a real email", () => {
    const parsed = registerSchema.parse({
      username: "newuser",
      email: "A@Example.com",
      password: "hunter2",
      passwordConfirm: "hunter2",
    })
    expect(parsed.email).toBe("a@example.com")
  })

  it("rejects mismatched passwords", () => {
    const result = registerSchema.safeParse({
      username: "newuser",
      email: "",
      password: "hunter2",
      passwordConfirm: "hunter3",
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid email when provided", () => {
    expect(
      registerSchema.safeParse({
        username: "newuser",
        email: "not-an-email",
        password: "hunter2",
        passwordConfirm: "hunter2",
      }).success
    ).toBe(false)
  })
})

describe("changePasswordSchema", () => {
  it("requires matching passwords", () => {
    expect(
      changePasswordSchema.safeParse({
        password: "hunter2",
        passwordConfirm: "hunter2",
      }).success
    ).toBe(true)
    expect(
      changePasswordSchema.safeParse({
        password: "hunter2",
        passwordConfirm: "nope12",
      }).success
    ).toBe(false)
  })
})

describe("changeEmailSchema", () => {
  it("allows blank email (clear / optional)", () => {
    expect(changeEmailSchema.parse({ email: "  " })).toEqual({ email: "" })
  })

  it("lowercases valid email", () => {
    expect(changeEmailSchema.parse({ email: "Hi@Ex.COM" })).toEqual({
      email: "hi@ex.com",
    })
  })
})
