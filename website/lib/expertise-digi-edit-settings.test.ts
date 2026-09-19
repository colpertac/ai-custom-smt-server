import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("expertise-digi-edit-settings", () => {
  let dir: string
  let prevDataDir: string | undefined

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-exp-digi-"))
    prevDataDir = process.env.WEBSITE_DATA_DIR
    process.env.WEBSITE_DATA_DIR = dir
    vi.resetModules()
  })

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.WEBSITE_DATA_DIR
    else process.env.WEBSITE_DATA_DIR = prevDataDir
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it("defaults to disabled", async () => {
    const mod = await import("@/lib/expertise-digi-edit-settings")
    expect(mod.getExpertiseDigiEditSettings()).toEqual({
      enabled: false,
      minUserLevel: 0,
    })
    expect(mod.canEditExpertiseDigi(1000)).toBe(false)
  })

  it("gates by min user level when enabled", async () => {
    const mod = await import("@/lib/expertise-digi-edit-settings")
    mod.setExpertiseDigiEditSettings({ enabled: true, minUserLevel: 10 })
    expect(mod.canEditExpertiseDigi(0)).toBe(false)
    expect(mod.canEditExpertiseDigi(9)).toBe(false)
    expect(mod.canEditExpertiseDigi(10)).toBe(true)
    expect(mod.canEditExpertiseDigi(1000)).toBe(true)
  })
})
