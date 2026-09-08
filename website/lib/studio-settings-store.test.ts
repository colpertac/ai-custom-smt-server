import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("studio-settings-store", () => {
  let dataDir: string
  const prevData = process.env.WEBSITE_DATA_DIR
  const prevUrl = process.env.PORTRAIT_STUDIO_URL
  const prevToken = process.env.PORTRAIT_STUDIO_TOKEN
  const prevComp = process.env.COMP_STUDIO_TOKEN
  const prevWorker = process.env.PORTRAIT_WORKER_TOKEN
  const prevPreview = process.env.PORTRAIT_PREVIEW_URL

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-settings-"))
    process.env.WEBSITE_DATA_DIR = dataDir
    delete process.env.PORTRAIT_STUDIO_URL
    delete process.env.PORTRAIT_STUDIO_TOKEN
    delete process.env.COMP_STUDIO_TOKEN
    delete process.env.PORTRAIT_WORKER_TOKEN
    delete process.env.PORTRAIT_PREVIEW_URL
    vi.resetModules()
  })

  afterEach(() => {
    if (prevData === undefined) delete process.env.WEBSITE_DATA_DIR
    else process.env.WEBSITE_DATA_DIR = prevData
    if (prevUrl === undefined) delete process.env.PORTRAIT_STUDIO_URL
    else process.env.PORTRAIT_STUDIO_URL = prevUrl
    if (prevToken === undefined) delete process.env.PORTRAIT_STUDIO_TOKEN
    else process.env.PORTRAIT_STUDIO_TOKEN = prevToken
    if (prevComp === undefined) delete process.env.COMP_STUDIO_TOKEN
    else process.env.COMP_STUDIO_TOKEN = prevComp
    if (prevWorker === undefined) delete process.env.PORTRAIT_WORKER_TOKEN
    else process.env.PORTRAIT_WORKER_TOKEN = prevWorker
    if (prevPreview === undefined) delete process.env.PORTRAIT_PREVIEW_URL
    else process.env.PORTRAIT_PREVIEW_URL = prevPreview
    fs.rmSync(dataDir, { recursive: true, force: true })
  })

  it("defaults studio URL and reads token from store", async () => {
    const mod = await import("./studio-settings-store")
    expect(mod.getEffectiveStudioUrl()).toBe("http://127.0.0.1:14700")
    expect(mod.getEffectiveStudioToken()).toBe("")

    mod.setStudioConnectionSettings({
      studioUrl: "http://10.0.0.5:14700/",
      studioToken: "secret-a",
    })
    expect(mod.getEffectiveStudioUrl()).toBe("http://10.0.0.5:14700")
    expect(mod.getEffectiveStudioToken()).toBe("secret-a")
    expect(mod.getEffectivePortraitWorkerToken()).toBe("secret-a")

    const admin = mod.getStudioConnectionForAdmin()
    expect(admin.studioTokenConfigured).toBe(true)
    expect(admin.studioTokenFromEnv).toBe(false)
  })

  it("seeds from env once when store empty", async () => {
    process.env.PORTRAIT_STUDIO_URL = "http://env-host:14700"
    process.env.PORTRAIT_STUDIO_TOKEN = "env-token"
    const mod = await import("./studio-settings-store")
    expect(mod.getEffectiveStudioUrl()).toBe("http://env-host:14700")
    expect(mod.getEffectiveStudioToken()).toBe("env-token")
    const admin = mod.getStudioConnectionForAdmin()
    expect(admin.studioTokenConfigured).toBe(true)
  })

  it("leaves token unchanged when empty string submitted", async () => {
    const mod = await import("./studio-settings-store")
    mod.setStudioConnectionSettings({ studioToken: "keep-me" })
    mod.setStudioConnectionSettings({ studioToken: "" })
    expect(mod.getEffectiveStudioToken()).toBe("keep-me")
  })
})
