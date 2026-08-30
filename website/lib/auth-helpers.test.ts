import { afterEach, describe, expect, it } from "vitest"

import { isAdminLevel, ADMIN_USER_LEVEL } from "@/lib/admin-level"
import {
  clientIpFromHeaders,
  clientKey,
  rateLimit,
  resetRateLimitBuckets,
} from "@/lib/rate-limit"
import { parseAccountDetails } from "@/lib/comp-api"

describe("isAdminLevel", () => {
  it("requires user_level >= 1000", () => {
    expect(ADMIN_USER_LEVEL).toBe(1000)
    expect(isAdminLevel(999)).toBe(false)
    expect(isAdminLevel(1000)).toBe(true)
    expect(isAdminLevel(undefined)).toBe(false)
  })
})

describe("rateLimit", () => {
  afterEach(() => {
    resetRateLimitBuckets()
  })

  it("allows up to the limit then blocks", () => {
    const key = "login:test-ip"
    expect(rateLimit(key, 2, 60_000).ok).toBe(true)
    expect(rateLimit(key, 2, 60_000).ok).toBe(true)
    const blocked = rateLimit(key, 2, 60_000)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) {
      expect(blocked.retryAfterSec).toBeGreaterThan(0)
    }
  })

  it("clientKey is stable for the same IP", () => {
    expect(clientKey("login", "1.2.3.4")).toBe(clientKey("login", "1.2.3.4"))
    expect(clientKey("login", "1.2.3.4")).not.toBe(clientKey("login", "9.9.9.9"))
  })

  it("reads client IP from forwarded headers", () => {
    const h = new Headers({
      "x-forwarded-for": "10.0.0.5, 10.0.0.6",
    })
    expect(clientIpFromHeaders(h)).toBe("10.0.0.5")
  })
})

describe("parseAccountDetails", () => {
  it("maps lobby snake_case fields", () => {
    const details = parseAccountDetails({
      username: "webtest",
      disp_name: "Web",
      email: "a@b.com",
      cp: 50,
      ticket_count: 2,
      user_level: 1000,
      enabled: true,
      last_login: 1700000000,
      character_count: 1,
      ban_reason: "",
      ban_initiator: "",
    })
    expect(details).toMatchObject({
      username: "webtest",
      dispName: "Web",
      email: "a@b.com",
      cp: 50,
      ticketCount: 2,
      userLevel: 1000,
      characterCount: 1,
    })
  })
})
