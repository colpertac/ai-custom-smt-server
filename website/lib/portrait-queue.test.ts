import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { PortraitFingerprintInput } from "@/lib/armory-portrait"

function sample(
  over: Partial<PortraitFingerprintInput> = {}
): PortraitFingerprintInput {
  return {
    appearance: {
      gender: 0,
      skinType: 101,
      hairType: 6,
      faceType: 5,
      eyeType: 2,
      hairColor: 91,
      leftEyeColor: 42,
      rightEyeColor: 42,
    },
    title: 0,
    equippedVA: [{ slot: 3, itemType: 23602 }],
    weaponType: 0,
    demonType: 0,
    ...over,
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

  it("enqueues once per fingerprint and refreshes the source name", async () => {
    const q = await load()
    const first = q.enqueuePortraitJob("cat2", sample())
    const again = q.enqueuePortraitJob("mannequin", sample())
    expect(first.fingerprint).toBe(again.fingerprint)
    expect(again.status).toBe("pending")
    expect(q.listPortraitJobs("pending")).toHaveLength(1)
    expect(q.getPortraitJob(first.fingerprint)?.characterName).toBe("mannequin")

    q.enqueuePortraitJob(
      "cat2",
      sample({ equippedVA: [{ slot: 3, itemType: 1 }] })
    )
    expect(q.listPortraitJobs("pending")).toHaveLength(2)
  })

  it("claims one job at a time and returns the in-flight claim", async () => {
    const q = await load()
    const a = q.enqueuePortraitJob("a", sample({ title: 1 }))
    const b = q.enqueuePortraitJob("b", sample({ title: 2 }))
    expect(a.fingerprint).not.toBe(b.fingerprint)

    const claimed = q.claimPortraitJob()
    expect(claimed?.fingerprint).toBe(a.fingerprint)
    expect(claimed?.status).toBe("claimed")
    expect(q.claimPortraitJob()?.fingerprint).toBe(a.fingerprint)
    expect(q.listPortraitJobs("pending")[0]?.fingerprint).toBe(b.fingerprint)
  })

  it("reclaims a stale claim then still prefers that oldest job", async () => {
    const q = await load()
    const a = q.enqueuePortraitJob("a", sample({ title: 1 }), 1000)
    q.enqueuePortraitJob("b", sample({ title: 2 }), 2000)
    expect(q.claimPortraitJob(3000)?.fingerprint).toBe(a.fingerprint)
    const later = 3000 + q.PORTRAIT_CLAIM_TIMEOUT_MS + 1
    expect(q.claimPortraitJob(later)?.fingerprint).toBe(a.fingerprint)
  })

  it("retries a failed job on the next enqueue", async () => {
    const q = await load()
    const { fingerprint } = q.enqueuePortraitJob("cat2", sample())
    q.claimPortraitJob()
    q.failPortraitJob(fingerprint, "client crashed")
    expect(q.getPortraitJob(fingerprint)?.status).toBe("failed")
    expect(q.enqueuePortraitJob("cat2", sample()).status).toBe("pending")
  })

  it("refuses complete until the hash-named PNG exists", async () => {
    const q = await load()
    const { fingerprint } = q.enqueuePortraitJob("cat2", sample())
    q.claimPortraitJob()
    expect(() => q.completePortraitJob(fingerprint)).toThrow(/No portraits/)
  })

  it("prints mannequin GM dress lines", async () => {
    const q = await load()
    const payload = q.buildPortraitJobPayload(
      "cat2",
      sample({
        equippedVA: [
          { slot: 24, itemType: 2004 },
          { slot: 3, itemType: 23602 },
        ],
        weaponType: 2001,
      })
    )
    const lines = q.gmDressCommands(payload)
    expect(lines.some((l) => l.includes("mannequin"))).toBe(true)
    expect(lines).toContain("@va 3 23602")
    expect(lines).toContain("@va 24 2004")
    expect(lines.some((l) => l.includes("2001"))).toBe(true)
  })
})
