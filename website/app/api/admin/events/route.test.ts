import { beforeEach, describe, expect, it, vi } from "vitest"

import { GET, PUT } from "./route"
import { getActiveEventIdsFromChannel } from "@/lib/events/events-fs"
import { validateLaneAConfig } from "@/lib/server-config/lane-a-config-publish"

vi.mock("@/lib/web-session", () => ({
  requireWebSession: vi.fn(),
}))

vi.mock("@/lib/api-guard", () => ({
  guardApiMutation: vi.fn().mockResolvedValue(null),
}))

import { requireWebSession } from "@/lib/web-session"

const mockedRequireWebSession = vi.mocked(requireWebSession)

describe("admin/events API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns 401 when session is missing", async () => {
    mockedRequireWebSession.mockResolvedValueOnce(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it("returns 403 when session user is not admin", async () => {
    mockedRequireWebSession.mockResolvedValueOnce({
      username: "normal_user",
      challenge: "abc",
      passwordHash: "dummy",
      userLevel: 0,
      dispName: "Player",
    })
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it("returns event list with active state when admin", async () => {
    mockedRequireWebSession.mockResolvedValueOnce({
      username: "admin",
      challenge: "abc",
      passwordHash: "dummy",
      userLevel: 1000,
      dispName: "Admin",
    })
    const res = await GET()
    expect(res.status).toBe(200)

    const json = (await res.json()) as {
      success: boolean
      data: {
        events: Array<{ id: string; titleEn: string; active: boolean }>
        activeCount: number
        isDirty: boolean
      }
    }
    expect(json.success).toBe(true)
    expect(json.data.events.length).toBeGreaterThan(50)
    expect(typeof json.data.activeCount).toBe("number")
  })

  it("updates active events via PUT and validates channel schema", async () => {
    const before = await getActiveEventIdsFromChannel()
    const initialActive = Array.from(before.activeIds)

    mockedRequireWebSession.mockResolvedValue({
      username: "admin",
      challenge: "abc",
      passwordHash: "dummy",
      userLevel: 1000,
      dispName: "Admin",
    })

    // Enable 201510_halloween
    const putReq = new Request("http://localhost/api/admin/events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: "201510_halloween",
        enabled: true,
      }),
    })

    const putRes = await PUT(putReq)
    expect(putRes.status).toBe(200)

    const putJson = (await putRes.json()) as {
      success: boolean
      data: { activeIds: string[]; activeCount: number }
    }
    expect(putJson.success).toBe(true)
    expect(putJson.data.activeIds).toContain("201510_halloween")

    // Verify channel.xml passes Lane A validation
    const validation = await validateLaneAConfig(["channel"])
    expect(validation.ok).toBe(true)
    expect(validation.releaseId).toBeDefined()

    // Restore initial state
    const restoreReq = new Request("http://localhost/api/admin/events", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activeIds: initialActive,
      }),
    })
    const restoreRes = await PUT(restoreReq)
    expect(restoreRes.status).toBe(200)
  })

  it("rejects enabling Ordeal and Sage together", async () => {
    const before = await getActiveEventIdsFromChannel()
    const initialActive = Array.from(before.activeIds).filter(
      (id) => id !== "201501_ordeal" && id !== "201506_sage"
    )

    mockedRequireWebSession.mockResolvedValue({
      username: "admin",
      challenge: "abc",
      passwordHash: "dummy",
      userLevel: 1000,
      dispName: "Admin",
    })

    // Start from a clean non-conflicting set
    await PUT(
      new Request("http://localhost/api/admin/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeIds: initialActive }),
      })
    )

    const enableOrdeal = await PUT(
      new Request("http://localhost/api/admin/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "201501_ordeal",
          enabled: true,
        }),
      })
    )
    expect(enableOrdeal.status).toBe(200)

    const enableSage = await PUT(
      new Request("http://localhost/api/admin/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: "201506_sage",
          enabled: true,
        }),
      })
    )
    expect(enableSage.status).toBe(400)
    const sageJson = (await enableSage.json()) as {
      success: boolean
      error: string
      data?: { conflicts?: Array<{ groupId: string; eventIds: string[] }> }
    }
    expect(sageJson.success).toBe(false)
    expect(sageJson.error).toBe("CONFLICT")
    expect(sageJson.data?.conflicts?.[0]?.groupId).toBe("thoth-babel-home")

    // Restore
    const restoreRes = await PUT(
      new Request("http://localhost/api/admin/events", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeIds: Array.from(before.activeIds),
        }),
      })
    )
    expect(restoreRes.status).toBe(200)
  })
})
