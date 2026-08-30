import { afterEach, describe, expect, it, vi } from "vitest"

import { authenticate, CompApiError } from "@/lib/comp-api"
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
