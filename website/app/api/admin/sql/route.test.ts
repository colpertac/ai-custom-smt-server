import { beforeEach, describe, expect, it, vi } from "vitest"

import { POST } from "./route"
import { AdminSqlError } from "@/lib/admin-sql"

vi.mock("@/lib/api-guard", () => ({
  guardApiMutation: vi.fn(async () => null),
}))

vi.mock("@/lib/web-session", () => ({
  requireWebSession: vi.fn(),
}))

vi.mock("@/lib/admin-sql", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin-sql")>(
    "@/lib/admin-sql"
  )
  return {
    ...actual,
    runAdminSql: vi.fn(() => ({
      columns: ["n"],
      rows: [[1]],
      rowCount: 1,
      truncated: false,
      maxRows: 500,
    })),
  }
})

import { requireWebSession } from "@/lib/web-session"
import { runAdminSql } from "@/lib/admin-sql"

const mockedRequireWebSession = vi.mocked(requireWebSession)
const mockedRunAdminSql = vi.mocked(runAdminSql)

describe("admin/sql route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedRunAdminSql.mockReturnValue({
      columns: ["n"],
      rows: [[1]],
      rowCount: 1,
      truncated: false,
      maxRows: 500,
    })
  })

  it("returns 401 when unauthenticated", async () => {
    mockedRequireWebSession.mockResolvedValueOnce(null)
    const res = await POST(
      new Request("http://localhost/api/admin/sql", {
        method: "POST",
        body: JSON.stringify({ sql: "SELECT 1" }),
      })
    )
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
    const res = await POST(
      new Request("http://localhost/api/admin/sql", {
        method: "POST",
        body: JSON.stringify({ sql: "SELECT 1" }),
      })
    )
    expect(res.status).toBe(403)
  })

  it("runs read-only SQL for admin", async () => {
    mockedRequireWebSession.mockResolvedValueOnce({
      username: "admin",
      challenge: "abc",
      passwordHash: "dummy",
      userLevel: 1000,
      dispName: "Admin",
    })
    const res = await POST(
      new Request("http://localhost/api/admin/sql", {
        method: "POST",
        body: JSON.stringify({ sql: "SELECT 1 AS n" }),
      })
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      success: boolean
      data: { columns: string[]; rows: unknown[][] }
    }
    expect(json.success).toBe(true)
    expect(json.data.columns).toEqual(["n"])
    expect(mockedRunAdminSql).toHaveBeenCalledWith("SELECT 1 AS n")
  })

  it("returns 400 when SQL is rejected", async () => {
    mockedRequireWebSession.mockResolvedValueOnce({
      username: "admin",
      challenge: "abc",
      passwordHash: "dummy",
      userLevel: 1000,
      dispName: "Admin",
    })
    mockedRunAdminSql.mockImplementationOnce(() => {
      throw new AdminSqlError("Only read-only SELECT queries are allowed")
    })

    const res = await POST(
      new Request("http://localhost/api/admin/sql", {
        method: "POST",
        body: JSON.stringify({ sql: "DELETE FROM Character" }),
      })
    )
    expect(res.status).toBe(400)
    const json = (await res.json()) as { success: boolean; message: string }
    expect(json.success).toBe(false)
    expect(json.message).toMatch(/read-only/i)
  })
})
