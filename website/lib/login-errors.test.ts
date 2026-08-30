import { describe, expect, it } from "vitest"

import { CompApiError } from "@/lib/comp-api"
import { classifyLoginError } from "@/lib/login-errors"

describe("classifyLoginError", () => {
  it("maps lobby get_challenge 400 (unknown user) to 401", () => {
    expect(classifyLoginError(new CompApiError("COMP API /auth/get_challenge failed (400)", 400))).toEqual({
      message: "Invalid username or password",
      statusCode: 401,
      error: "UNAUTHORIZED",
    })
  })

  it("maps wrong-password 401 to 401", () => {
    expect(classifyLoginError(new CompApiError("COMP API /account/get_details failed (401)", 401))).toEqual({
      message: "Invalid username or password",
      statusCode: 401,
      error: "UNAUTHORIZED",
    })
  })

  it("does not pretend COMP 5xx is a bad password", () => {
    expect(classifyLoginError(new CompApiError("down", 503))).toEqual({
      message: "down",
      statusCode: 502,
      error: "COMP",
    })
  })

  it("maps unknown errors to 502", () => {
    expect(classifyLoginError(new Error("fetch failed"))).toEqual({
      message: "fetch failed",
      statusCode: 502,
      error: "COMP",
    })
  })
})
