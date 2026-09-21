import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("demon-reunion-edit-settings", () => {
  let dir: string
  let prevDataDir: string | undefined

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-demon-reunion-"))
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
    const mod = await import("@/lib/demon-reunion-edit-settings")
    expect(mod.getDemonReunionEditSettings()).toEqual({
      enabled: false,
      minUserLevel: 0,
    })
    expect(mod.canEditDemonReunion(1000)).toBe(false)
  })

  it("gates by min user level when enabled", async () => {
    const mod = await import("@/lib/demon-reunion-edit-settings")
    mod.setDemonReunionEditSettings({ enabled: true, minUserLevel: 10 })
    expect(mod.canEditDemonReunion(0)).toBe(false)
    expect(mod.canEditDemonReunion(9)).toBe(false)
    expect(mod.canEditDemonReunion(10)).toBe(true)
    expect(mod.canEditDemonReunion(1000)).toBe(true)
  })
})
