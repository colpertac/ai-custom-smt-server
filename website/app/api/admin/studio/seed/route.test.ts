import { beforeEach, describe, expect, it, vi } from "vitest"

import { GET, POST } from "./route"
import { resetLobbyDbCache } from "@/lib/lobby-db"
import { resetWorldDbCache } from "@/lib/world-db"
import type { WebSession } from "@/lib/session"

vi.mock("@/lib/web-session", () => ({
  requireWebSession: vi.fn(),
  withCompSession: vi.fn(
    async <T>(fn: (session: WebSession) => Promise<T>): Promise<T> => {
      const session = await (
        await import("@/lib/web-session")
      ).requireWebSession()
      if (!session) {
        const { CompSessionMissingError } = await import("@/lib/web-session")
        throw new CompSessionMissingError()
      }
      return fn(session)
    }
  ),
  CompSessionMissingError: class CompSessionMissingError extends Error {
    constructor() {
      super("Not signed in")
      this.name = "CompSessionMissingError"
    }
  },
}))

import { requireWebSession, withCompSession } from "@/lib/web-session"

const mockedRequireWebSession = vi.mocked(requireWebSession)
const mockedWithCompSession = vi.mocked(withCompSession)

describe("admin/studio/seed route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetLobbyDbCache()
    resetWorldDbCache()
    mockedWithCompSession.mockImplementation(
      async <T>(fn: (session: WebSession) => Promise<T>): Promise<T> => {
        const session = await mockedRequireWebSession()
        if (!session) {
          const { CompSessionMissingError } = await import("@/lib/web-session")
          throw new CompSessionMissingError()
        }
        return fn(session)
      }
    )
  })

  it("returns 401 when unauthenticated", async () => {
    mockedRequireWebSession.mockResolvedValueOnce(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns 403 when user is not admin", async () => {
    mockedRequireWebSession.mockResolvedValueOnce({
      username: "user",
      challenge: "abc",
      passwordHash: "dummy",
      userLevel: 0,
      dispName: "User",
    })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("returns studio accounts overview when admin", async () => {
    mockedRequireWebSession.mockResolvedValueOnce({
      username: "admin",
      challenge: "abc",
      passwordHash: "dummy",
      userLevel: 1000,
      dispName: "Admin",
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const json = (await res.json()) as { success: boolean; data: { vam1: unknown; vaf1: unknown } }
    expect(json.success).toBe(true)
    expect(json.data.vam1).toBeDefined()
    expect(json.data.vaf1).toBeDefined()
  })

  it("POST seeds accounts and returns success when admin", async () => {
    const session = {
      username: "admin",
      challenge: "abc",
      passwordHash: "dummy",
      userLevel: 1000,
      dispName: "Admin",
    }
    // Gate check + withCompSession re-read
    mockedRequireWebSession.mockResolvedValue(session)
    const req = new Request("http://localhost/api/admin/studio/seed", {
      method: "POST",
      body: JSON.stringify({
        vamPass: "vam1vam1",
        vafPass: "vaf1vaf1",
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(mockedWithCompSession).toHaveBeenCalled()
    const json = (await res.json()) as {
      success: boolean
      data: { passwords: { vam1: string; vaf1: string } }
    }
    expect(json.success).toBe(true)
    expect(json.data.passwords.vam1).toBe("vam1vam1")
    expect(json.data.passwords.vaf1).toBe("vaf1vaf1")
  })
})
