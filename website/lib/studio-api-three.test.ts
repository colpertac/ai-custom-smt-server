import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  recordPortraitWorkerHeartbeat,
  resetPortraitWorkersForTests,
} from "@/lib/portrait-queue"
import { RENDERER_VERSION } from "@/lib/portrait-render-mode"
import { isPortraitCaptureAvailable } from "@/lib/studio-api"

describe("isPortraitCaptureAvailable (PORTRAIT_RENDERER=three)", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-studio-three-"))
    process.env.WEBSITE_DATA_DIR = dataDir
    process.env.PORTRAIT_RENDERER = "three"
    resetPortraitWorkersForTests()
  })

  afterEach(() => {
    resetPortraitWorkersForTests()
    fs.rmSync(dataDir, { recursive: true, force: true })
    delete process.env.WEBSITE_DATA_DIR
    delete process.env.PORTRAIT_RENDERER
  })

  it("follows render-worker heartbeats, not the Wine studio", async () => {
    const t0 = 5_000_000
    expect(await isPortraitCaptureAvailable({ gender: 0, now: t0 })).toBe(false)
    recordPortraitWorkerHeartbeat(
      {
        workerId: "w",
        kind: "three",
        rendererVersion: RENDERER_VERSION,
        assetsVersion: null,
        chrome: null,
        busy: false,
      },
      t0
    )
    expect(await isPortraitCaptureAvailable({ gender: 1, now: t0 + 59_000 })).toBe(true)
    expect(await isPortraitCaptureAvailable({ gender: 0, now: t0 + 61_000 })).toBe(false)
  })
})
