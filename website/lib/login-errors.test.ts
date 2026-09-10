import { describe, expect, it } from "vitest"

import { CompApiError } from "@/lib/comp-api"
import {
  classifyLoginError,
  isCompUnreachable,
  LOBBY_DOWN_LOGIN_MESSAGE,
} from "@/lib/login-errors"

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

  it("maps unreachable errors to a friendly lobby-down message", () => {
    expect(classifyLoginError(new Error("fetch failed"))).toEqual({
      message: LOBBY_DOWN_LOGIN_MESSAGE,
      statusCode: 502,
      error: "COMP",
    })
  })
})

describe("isCompUnreachable", () => {
  it("is false when lobby returned an HTTP CompApiError", () => {
    expect(isCompUnreachable(new CompApiError("bad", 401))).toBe(false)
    expect(isCompUnreachable(new CompApiError("down", 503))).toBe(false)
  })

  it("is true for network / fetch failures", () => {
    expect(isCompUnreachable(new Error("fetch failed"))).toBe(true)
    expect(isCompUnreachable(new TypeError("fetch failed"))).toBe(true)
  })
})
