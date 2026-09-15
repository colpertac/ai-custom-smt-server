import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { POST } from "@/app/api/ask/chat/route"
import { resetRateLimitBuckets } from "@/lib/rate-limit"

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

vi.mock("@/lib/ask-atlas-settings-store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/ask-atlas-settings-store")>()
  return {
    ...actual,
    isAskLlmConfigured: vi.fn(() => false),
    getAtlasCloudApiKey: vi.fn(() => undefined),
  }
})

vi.mock("@/lib/atlas-deepseek", () => ({
  buildGroundedAskMessages: vi.fn(),
  chatAtlasDeepSeek: vi.fn(),
}))

import { headers } from "next/headers"
import { isAskLlmConfigured } from "@/lib/ask-atlas-settings-store"

const mockedHeaders = vi.mocked(headers)
const mockedLlmConfigured = vi.mocked(isAskLlmConfigured)

function makePost(body: unknown) {
  return new NextRequest("http://localhost/api/ask/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("/api/ask/chat", () => {
  beforeEach(() => {
    mockedHeaders.mockResolvedValue(
      new Headers({ "x-forwarded-for": "127.0.0.1" })
    )
    mockedLlmConfigured.mockReturnValue(false)
  })

  afterEach(() => {
    resetRateLimitBuckets()
    vi.clearAllMocks()
  })

  it("returns retrieval-only answer when LLM is not configured", async () => {
    const res = await POST(
      makePost({
        messages: [
          {
            role: "user",
            content: "how do I complete the guard's desire",
          },
        ],
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mode).toBe("retrieval")
    expect(body.ok).toBe(true)
    expect(body.answer).toMatch(/Home III/i)
    expect(body.citations.length).toBeGreaterThan(0)
  })

  it("refuses exploit questions before retrieval/LLM", async () => {
    const res = await POST(
      makePost({
        messages: [{ role: "user", content: "how to hack an account" }],
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.answer).toMatch(/account/i)
    expect(body.mode).toBe("retrieval")
  })

  it("rate limits chat more strictly than search", async () => {
    mockedHeaders.mockResolvedValue(
      new Headers({ "x-forwarded-for": "10.88.0.2" })
    )
    for (let i = 0; i < 10; i++) {
      const ok = await POST(makePost({ q: "quest 5" }))
      expect(ok.status).toBe(200)
    }
    const blocked = await POST(makePost({ q: "quest 5" }))
    expect(blocked.status).toBe(429)
  })
})
