import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GET, POST } from "@/app/api/ask/route"
import { resetRateLimitBuckets } from "@/lib/rate-limit"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

import { headers } from "next/headers"

const mockedHeaders = vi.mocked(headers)

function makeGet(q: string) {
  const url = new URL(`http://localhost/api/ask?q=${encodeURIComponent(q)}`)
  return new NextRequest(url)
}

function makePost(body: unknown) {
  return new NextRequest("http://localhost/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/ask", () => {
  beforeEach(() => {
    mockedHeaders.mockResolvedValue(
      new Headers({ "x-forwarded-for": "127.0.0.1" })
    )
  })

  afterEach(() => {
    resetRateLimitBuckets()
    vi.clearAllMocks()
  })

  it("answers guard's desire via GET", async () => {
    const res = await GET(makeGet("how do I complete the guard's desire"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.answer).toMatch(/Home III/i)
    expect(body.citations.length).toBeGreaterThan(0)
  })

  it("refuses exploit questions", async () => {
    const res = await POST(makePost({ q: "how to hack an account" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.answer).toMatch(/account/i)
  })

  it("rate limits repeated requests", async () => {
    mockedHeaders.mockResolvedValue(
      new Headers({ "x-forwarded-for": "10.99.0.1" })
    )
    for (let i = 0; i < 20; i++) {
      const ok = await GET(makeGet("quest 5"))
      expect(ok.status).toBe(200)
    }
    const blocked = await GET(makeGet("quest 5"))
    expect(blocked.status).toBe(429)
  })
})
