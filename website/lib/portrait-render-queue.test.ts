import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AvatarRecipe } from "@/lib/avatar-recipe"
import { portraitFingerprintV3 } from "@/lib/portrait-fingerprint-v3"
import { RENDERER_VERSION } from "@/lib/portrait-renderer"

function recipe(hair = 10): AvatarRecipe {
  return {
    gender: "M",
    skinType: 101,
    skeleton: { nif: "M.nif", scale: 1, idle: "idle.kf", stance: null },
    parts: { Hair: { file: "M_Hair.nif", why: "w", exists: true } },
    colors: { hair: [hair, 0, 0], eyeRight: [0, 0, 0], eyeLeft: [0, 0, 0] },
    notes: [],
  }
}

describe("portrait queue — render worker", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-portraits3-"))
    process.env.WEBSITE_DATA_DIR = dataDir
  })

  afterEach(async () => {
    const q = await import("@/lib/portrait-queue")
    q.resetPortraitQueueForTests()
    q.resetPortraitWorkersForTests()
    fs.rmSync(dataDir, { recursive: true, force: true })
    delete process.env.WEBSITE_DATA_DIR
  })

  async function load() {
    const q = await import("@/lib/portrait-queue")
    q.resetPortraitQueueForTests()
    q.resetPortraitWorkersForTests()
    return q
  }

  it("recipe job payload carries recipe, preset, size and rendererVersion", async () => {
    const q = await load()
    const r = recipe()
    const enq = q.enqueuePortraitRecipeJob("cat2", r, 2, 1_000)
    expect(enq.fingerprint).toBe(portraitFingerprintV3(r, 2))
    const job = q.getPortraitJob(enq.fingerprint)!
    expect(job.payload).toMatchObject({
      fingerprint: enq.fingerprint,
      characterName: "cat2",
      recipe: r,
      catalogVersion: 2,
      rendererVersion: RENDERER_VERSION,
      preset: "front",
      width: 768,
      height: 925,
    })

    // Same look under another name shares the job (name is not in v3).
    expect(q.enqueuePortraitRecipeJob("alt", r, 2, 2_000).fingerprint).toBe(
      enq.fingerprint
    )
    expect(q.listPortraitJobs()).toHaveLength(1)
  })

  it("claim fails stale-rendererVersion recipe jobs instead of claiming them", async () => {
    const q = await load()
    const r = recipe()
    const enq = q.enqueuePortraitRecipeJob("cat2", r, 2, 1_000)
    // Simulate a job queued by an older site version.
    const { DatabaseSync } = await import("@/lib/node-sqlite")
    const db = new DatabaseSync(path.join(dataDir, "portraits.db"))
    const job = q.getPortraitJob(enq.fingerprint)!
    db.prepare(`UPDATE portrait_jobs SET payload_json = ? WHERE fingerprint = ?`).run(
      JSON.stringify({ ...job.payload, rendererVersion: RENDERER_VERSION - 1 }),
      enq.fingerprint
    )
    db.close()
    expect(q.claimPortraitJob(2_000)).toBeNull()
    expect(q.getPortraitJob(enq.fingerprint)?.status).toBe("failed")
    expect(q.getPortraitJob(enq.fingerprint)?.error).toMatch(/stale rendererVersion/)
  })

  it("claimRenderWorkerJob rejects a mismatched or unknown worker version", async () => {
    const q = await load()
    const enq = q.enqueuePortraitRecipeJob("cat2", recipe(), 2, 1_000)

    const mismatch = q.claimRenderWorkerJob({ rendererVersion: RENDERER_VERSION + 1 })
    expect(mismatch.versionMismatch).toBe(true)
    expect(mismatch.job).toBeNull()

    const unknown = q.claimRenderWorkerJob({})
    expect(unknown.versionMismatch).toBe(true)

    // Version from the worker's heartbeat when the body omits it.
    q.recordPortraitWorkerHeartbeat({
      workerId: "w1",
      kind: "three",
      rendererVersion: RENDERER_VERSION + 1,
      assetsVersion: "a1",
      chrome: null,
      busy: false,
    })
    expect(q.claimRenderWorkerJob({ workerId: "w1" }).versionMismatch).toBe(true)
    q.recordPortraitWorkerHeartbeat({
      workerId: "w1",
      kind: "three",
      rendererVersion: RENDERER_VERSION,
      assetsVersion: "a1",
      chrome: null,
      busy: false,
    })
    const ok = q.claimRenderWorkerJob({ workerId: "w1" })
    expect(ok.versionMismatch).toBe(false)
    expect(ok.job?.fingerprint).toBe(enq.fingerprint)
    expect(q.getPortraitJob(enq.fingerprint)?.status).toBe("claimed")

    expect(
      q.claimRenderWorkerJob({ rendererVersion: RENDERER_VERSION }).job?.fingerprint
    ).toBe(enq.fingerprint)
  })

  it("heartbeat freshness: 60 s window, matching kind and version, survives reopen", async () => {
    const q = await load()
    const t0 = 1_000_000
    expect(q.isRenderWorkerAvailable(t0)).toBe(false)

    q.recordPortraitWorkerHeartbeat(
      {
        workerId: "box",
        kind: "three",
        rendererVersion: RENDERER_VERSION,
        assetsVersion: "abc",
        chrome: "Chrome/140",
        busy: true,
      },
      t0
    )
    expect(q.isRenderWorkerAvailable(t0 + 1_000)).toBe(true)
    expect(q.isRenderWorkerAvailable(t0 + 60_000)).toBe(true)
    expect(q.isRenderWorkerAvailable(t0 + 60_001)).toBe(false)

    // Persisted in portraits.db: a fresh handle (another process / restart) sees it.
    q.reopenPortraitDb()
    const [hb] = q.listPortraitWorkerHeartbeats()
    expect(hb).toMatchObject({
      workerId: "box",
      kind: "three",
      rendererVersion: RENDERER_VERSION,
      assetsVersion: "abc",
      chrome: "Chrome/140",
      busy: true,
      firstSeen: t0,
      lastSeen: t0,
    })

    // A later beat updates lastSeen but keeps firstSeen.
    q.recordPortraitWorkerHeartbeat(
      { ...hb!, busy: false },
      t0 + 30_000
    )
    expect(q.getPortraitWorkerHeartbeat("box")).toMatchObject({
      firstSeen: t0,
      lastSeen: t0 + 30_000,
      busy: false,
    })

    // Wrong version or kind does not count as available.
    q.resetPortraitWorkersForTests()
    q.recordPortraitWorkerHeartbeat(
      { workerId: "old", kind: "three", rendererVersion: RENDERER_VERSION + 1, assetsVersion: null, chrome: null, busy: false },
      t0
    )
    q.recordPortraitWorkerHeartbeat(
      { workerId: "other", kind: "other", rendererVersion: RENDERER_VERSION, assetsVersion: null, chrome: null, busy: false },
      t0
    )
    expect(q.isRenderWorkerAvailable(t0 + 1_000)).toBe(false)
  })
})
