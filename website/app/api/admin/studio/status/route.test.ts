import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GET } from "./route"
import { resetStudioProbeCache } from "@/lib/studio-api"

vi.mock("@/lib/web-session", () => ({
  requireWebSession: vi.fn(),
}))

vi.mock("@/lib/admin-portrait-queue", () => ({
  getRenderWorkerStatus: vi.fn(() => ({
    rendererVersion: 1,
    online: true,
    workers: [
      {
        workerId: "three-test",
        kind: "three",
        rendererVersion: 1,
        assetsVersion: "a",
        chrome: null,
        busy: false,
        lastSeen: Date.now() - 3_000,
        fresh: true,
        usable: true,
      },
    ],
    counts: { pending: 0, claimed: 0, ready: 2, failed: 0, total: 2 },
  })),
}))

import { requireWebSession } from "@/lib/web-session"

const mockedSession = vi.mocked(requireWebSession)

const ADMIN = {
  username: "admin",
  challenge: "abc",
  passwordHash: "dummy",
  userLevel: 1000,
  dispName: "Admin",
}

const ENV_KEYS = [
  "WEBSITE_DATA_DIR",
  "PORTRAIT_STUDIO_URL",
  "PORTRAIT_STUDIO_TOKEN",
  "COMP_STUDIO_TOKEN",
  "PORTRAIT_WORKER_TOKEN",
] as const

type StatusBody = {
  success: boolean
  data: {
    liveStats: string
    workerTokenConfigured: boolean
    misconfigured: boolean
    renderWorker: { online: boolean } | null
  }
}

describe("GET /api/admin/studio/status", () => {
  const prev: Record<string, string | undefined> = {}
  let dataDir: string
  const fetchMock = vi.fn()

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      prev[k] = process.env[k]
      delete process.env[k]
    }
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-status-"))
    process.env.WEBSITE_DATA_DIR = dataDir
    process.env.PORTRAIT_STUDIO_URL = "http://channel:14700"
    process.env.PORTRAIT_STUDIO_TOKEN = "secret-studio"
    process.env.PORTRAIT_WORKER_TOKEN = "secret-worker"
    resetStudioProbeCache()
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    mockedSession.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const k of ENV_KEYS) {
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
    }
    fs.rmSync(dataDir, { recursive: true, force: true })
  })

  async function call(): Promise<{ status: number; body: StatusBody; text: string }> {
    const res = await GET()
    const text = await res.text()
    return { status: res.status, body: JSON.parse(text) as StatusBody, text }
  }

  it("401 without a session", async () => {
    mockedSession.mockResolvedValueOnce(null)
    expect((await call()).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("403 for non-admins", async () => {
    mockedSession.mockResolvedValueOnce({ ...ADMIN, userLevel: 0 })
    expect((await call()).status).toBe(403)
  })

  it("connected when /studio/health answers; never leaks tokens or URLs", async () => {
    mockedSession.mockResolvedValue(ADMIN)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )
    const { status, body, text } = await call()
    expect(status).toBe(200)
    expect(body.data.liveStats).toBe("connected")
    expect(body.data.workerTokenConfigured).toBe(true)
    expect(body.data.misconfigured).toBe(false)
    expect(body.data.renderWorker?.online).toBe(true)
    expect(text).not.toContain("secret-studio")
    expect(text).not.toContain("secret-worker")
    expect(text).not.toContain("channel:14700")

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://channel:14700/studio/health")
    expect((init.headers as Record<string, string>)["X-Studio-Token"]).toBe(
      "secret-studio"
    )
  })

  it("caches the probe for a few seconds", async () => {
    mockedSession.mockResolvedValue(ADMIN)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )
    await call()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    )
    await call()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("rejected when the channel refuses the token", async () => {
    mockedSession.mockResolvedValue(ADMIN)
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
      })
    )
    const { body } = await call()
    expect(body.data.liveStats).toBe("rejected")
    expect(body.data.misconfigured).toBe(true)
  })

  it("unreachable when the channel does not answer", async () => {
    mockedSession.mockResolvedValue(ADMIN)
    fetchMock.mockRejectedValue(new TypeError("fetch failed"))
    const { body } = await call()
    expect(body.data.liveStats).toBe("unreachable")
    expect(body.data.misconfigured).toBe(false)
  })

  it("not_configured without env or saved values", async () => {
    delete process.env.PORTRAIT_STUDIO_URL
    delete process.env.PORTRAIT_STUDIO_TOKEN
    delete process.env.PORTRAIT_WORKER_TOKEN
    mockedSession.mockResolvedValue(ADMIN)
    const { body } = await call()
    expect(body.data.liveStats).toBe("not_configured")
    expect(body.data.workerTokenConfigured).toBe(false)
    expect(body.data.misconfigured).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
