import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { AvatarRecipe } from "@/lib/avatar-recipe"

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

describe("portrait-queue", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-portraits-"))
    process.env.WEBSITE_DATA_DIR = dataDir
  })

  afterEach(async () => {
    const { resetPortraitQueueForTests } = await import("@/lib/portrait-queue")
    resetPortraitQueueForTests()
    fs.rmSync(dataDir, { recursive: true, force: true })
    delete process.env.WEBSITE_DATA_DIR
  })

  async function load() {
    const mod = await import("@/lib/portrait-queue")
    mod.resetPortraitQueueForTests()
    return mod
  }

  it("keeps one pending job per look fingerprint", async () => {
    const q = await load()
    const first = q.enqueuePortraitRecipeJob("cat2", recipe(), 2)
    const again = q.enqueuePortraitRecipeJob("cat2", recipe(), 2)
    expect(first.fingerprint).toBe(again.fingerprint)
    expect(again.status).toBe("pending")
    expect(q.listPortraitJobs("pending")).toHaveLength(1)

    q.enqueuePortraitRecipeJob("cat2", recipe(11), 2)
    expect(q.listPortraitJobs("pending")).toHaveLength(2)
  })

  it("claims one job at a time and returns the in-flight claim", async () => {
    const q = await load()
    const a = q.enqueuePortraitRecipeJob("a", recipe(1), 2, 1000)
    const b = q.enqueuePortraitRecipeJob("b", recipe(2), 2, 2000)
    expect(a.fingerprint).not.toBe(b.fingerprint)

    const claimed = q.claimPortraitJob(3000)
    expect(claimed?.fingerprint).toBe(a.fingerprint)
    expect(claimed?.status).toBe("claimed")
    expect(q.claimPortraitJob(3100)?.fingerprint).toBe(a.fingerprint)
    expect(q.listPortraitJobs("pending")[0]?.fingerprint).toBe(b.fingerprint)
  })

  it("reclaims a stale claim then still prefers that oldest job", async () => {
    const q = await load()
    const a = q.enqueuePortraitRecipeJob("a", recipe(1), 2, 1000)
    q.enqueuePortraitRecipeJob("b", recipe(2), 2, 2000)
    expect(q.claimPortraitJob(3000)?.fingerprint).toBe(a.fingerprint)
    const later = 3000 + q.PORTRAIT_CLAIM_TIMEOUT_MS + 1
    expect(q.claimPortraitJob(later)?.fingerprint).toBe(a.fingerprint)
  })

  it("retries a failed job on the next enqueue", async () => {
    const q = await load()
    const { fingerprint } = q.enqueuePortraitRecipeJob("cat2", recipe(), 2, 1000)
    q.claimPortraitJob(2000)
    q.failPortraitJob(fingerprint, "render crashed", 3000)
    expect(q.getPortraitJob(fingerprint)?.status).toBe("failed")
    expect(
      q.enqueuePortraitRecipeJob("cat2", recipe(), 2, 3000 + q.PORTRAIT_FAIL_RETRY_MS + 1)
        .status
    ).toBe("pending")
  })

  it("does not immediately re-enqueue a recently failed job", async () => {
    const q = await load()
    const { fingerprint } = q.enqueuePortraitRecipeJob("cat2", recipe(), 2, 1000)
    q.claimPortraitJob(2000)
    q.failPortraitJob(fingerprint, "EACCES", 3000)
    expect(q.enqueuePortraitRecipeJob("cat2", recipe(), 2, 4000).status).toBe("failed")
    expect(q.getPortraitJob(fingerprint)?.error).toBe("EACCES")
    expect(q.getPortraitJob(fingerprint)?.updatedAt).toBe(3000)
  })

  it("refuses complete until the hash-named PNG exists", async () => {
    const q = await load()
    const { fingerprint } = q.enqueuePortraitRecipeJob("cat2", recipe(), 2)
    q.claimPortraitJob()
    expect(() => q.completePortraitJob(fingerprint)).toThrow(/No portraits/)
  })

  it("ingests PNG bytes and marks ready", async () => {
    const q = await load()
    const { fingerprint } = q.enqueuePortraitRecipeJob("cat2", recipe(), 2)
    q.claimPortraitJob()
    // Minimal header our ingest checks (not a full decode).
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3,
    ])
    const result = q.ingestPortraitBytes(png, fingerprint)
    expect(result.fingerprint).toBe(fingerprint)
    expect(result.url).toContain(fingerprint)
    expect(q.getPortraitJob(fingerprint)?.status).toBe("ready")
  })

  it("fails legacy jobs without a recipe instead of claiming them", async () => {
    const q = await load()
    q.enqueuePortraitRecipeJob("cat2", recipe(), 2, 1000)
    const { DatabaseSync } = await import("@/lib/node-sqlite")
    const db = new DatabaseSync(path.join(dataDir, "portraits.db"))
    db.prepare(
      `INSERT INTO portrait_jobs (fingerprint, character_name, payload_json, status,
         claimed_at, error, created_at, updated_at)
       VALUES ('00000000000000aa', 'old', '{"fingerprint":"00000000000000aa"}', 'pending',
         NULL, NULL, 500, 500)`
    ).run()
    db.close()
    expect(q.claimPortraitJob(2000)?.characterName).toBe("cat2")
    expect(q.getPortraitJob("00000000000000aa")).toMatchObject({
      status: "failed",
      error: "legacy job without an avatar recipe",
    })
  })
})
