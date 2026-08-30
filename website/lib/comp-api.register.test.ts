import { afterEach, describe, expect, it, vi } from "vitest"

import { CompApiError, registerAccount } from "@/lib/comp-api"
import { classifyRegisterError } from "@/lib/register-errors"

describe("registerAccount", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("sends a unique placeholder when email is omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ error: "Success" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await registerAccount({
      username: "NewUser",
      email: "",
      password: "hunter2",
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      username: "newuser",
      email: "noreply+newuser@local.invalid",
      password: "hunter2",
    })
  })

  it("preserves a real email (lowercased by lobby; we send trimmed)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ error: "Success" }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await registerAccount({
      username: "newuser",
      email: "  A@Example.com ",
      password: "hunter2",
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(String(init.body)).email).toBe("a@example.com")
  })
})

describe("classifyRegisterError", () => {
  it("maps bare lobby 400 to a client-facing register message", () => {
    expect(
      classifyRegisterError(
        new CompApiError("COMP API /account/register failed (400)", 400)
      )
    ).toEqual({
      message:
        "Could not create account. Check username, password, and email.",
      statusCode: 400,
      error: "REGISTER",
    })
  })
})
