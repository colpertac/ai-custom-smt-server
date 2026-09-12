import { afterEach, describe, expect, it, vi } from "vitest"

import {
  authenticate,
  authenticatedRequest,
  CompApiError,
} from "@/lib/comp-api"
import { challengeReply, passwordHash } from "@/lib/sha512"

describe("authenticate (login challenge flow)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("fetches challenge and builds COMP auth state", async () => {
    const salt = "testsalt"
    const challenge = "testchallenge"
    const password = "hunter2"
    const username = "WebTest"

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          salt,
          challenge,
        }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const auth = await authenticate(username, password)

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/api/auth/get_challenge")
    expect(JSON.parse(String(init.body))).toEqual({ username: "webtest" })

    const expectedHash = passwordHash(password, salt)
    expect(auth).toEqual({
      username: "webtest",
      passwordHash: expectedHash,
      challenge: challengeReply(expectedHash, challenge),
    })
  })

  it("throws when lobby returns non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: "nope" }),
      })
    )

    await expect(authenticate("webtest", "hunter2")).rejects.toBeInstanceOf(
      CompApiError
    )
  })
})

describe("authenticatedRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("re-mints challenge once after lobby 401", async () => {
    const passwordHashValue = passwordHash("hunter2", "salt")
    const auth = {
      username: "webtest",
      passwordHash: passwordHashValue,
      challenge: "stale-reply",
    }

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ salt: "salt", challenge: "fresh-raw" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({ error: "Success", challenge: "next-raw" }),
      })
    vi.stubGlobal("fetch", fetchMock)

    const data = await authenticatedRequest(auth, "/admin/get_accounts")

    expect(data.error).toBe("Success")
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/auth/get_challenge")
    expect(auth.challenge).toBe(challengeReply(passwordHashValue, "next-raw"))
  })
})
