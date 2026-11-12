import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const ENV_KEYS = [
  "WEBSITE_DATA_DIR",
  "PORTRAIT_STUDIO_URL",
  "PORTRAIT_STUDIO_TOKEN",
  "COMP_STUDIO_TOKEN",
  "PORTRAIT_WORKER_TOKEN",
] as const

describe("studio-settings-store (env > saved > empty)", () => {
  let dataDir: string
  const prev: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      prev[k] = process.env[k]
      delete process.env[k]
    }
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-settings-"))
    process.env.WEBSITE_DATA_DIR = dataDir
    vi.resetModules()
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
    }
    fs.rmSync(dataDir, { recursive: true, force: true })
  })

  async function saveLegacy(values: Record<string, string>) {
    const store = await import("./site-settings-store")
    for (const [k, v] of Object.entries(values)) store.setSiteSetting(k, v)
  }

  it("is empty when nothing is configured", async () => {
    const mod = await import("./studio-settings-store")
    expect(mod.getEffectiveStudioUrl()).toBe("")
    expect(mod.getEffectiveStudioToken()).toBe("")
    expect(mod.getEffectivePortraitWorkerToken()).toBe("")
  })

  it("reads env (install / compose)", async () => {
    process.env.PORTRAIT_STUDIO_URL = "http://channel:14700/"
    process.env.PORTRAIT_STUDIO_TOKEN = " env-studio "
    process.env.PORTRAIT_WORKER_TOKEN = "env-worker"
    const mod = await import("./studio-settings-store")
    expect(mod.getEffectiveStudioUrl()).toBe("http://channel:14700")
    expect(mod.getEffectiveStudioToken()).toBe("env-studio")
    expect(mod.getEffectivePortraitWorkerToken()).toBe("env-worker")
  })

  it("prefers env over values saved by the old admin form", async () => {
    await saveLegacy({
      portrait_studio_url: "http://192.168.0.230:14700",
      portrait_studio_token: "saved-studio",
      portrait_worker_token: "saved-worker",
    })
    process.env.PORTRAIT_STUDIO_URL = "http://channel:14700"
    process.env.PORTRAIT_STUDIO_TOKEN = "env-studio"
    process.env.PORTRAIT_WORKER_TOKEN = "env-worker"
    const mod = await import("./studio-settings-store")
    expect(mod.getEffectiveStudioUrl()).toBe("http://channel:14700")
    expect(mod.getEffectiveStudioToken()).toBe("env-studio")
    expect(mod.getEffectivePortraitWorkerToken()).toBe("env-worker")
  })

  it("falls back to saved values when env is empty (existing installs)", async () => {
    await saveLegacy({
      portrait_studio_url: "http://192.168.0.230:14700/",
      portrait_studio_token: "saved-studio",
      portrait_worker_token: "saved-worker",
    })
    // Compose passes empty strings when .env has no STUDIO_TOKEN yet.
    process.env.PORTRAIT_STUDIO_TOKEN = ""
    process.env.PORTRAIT_WORKER_TOKEN = ""
    const mod = await import("./studio-settings-store")
    expect(mod.getEffectiveStudioUrl()).toBe("http://192.168.0.230:14700")
    expect(mod.getEffectiveStudioToken()).toBe("saved-studio")
    expect(mod.getEffectivePortraitWorkerToken()).toBe("saved-worker")
  })

  it("mixes env URL with a saved token", async () => {
    await saveLegacy({ portrait_studio_token: "saved-studio" })
    process.env.PORTRAIT_STUDIO_URL = "http://channel:14700"
    const mod = await import("./studio-settings-store")
    expect(mod.getEffectiveStudioUrl()).toBe("http://channel:14700")
    expect(mod.getEffectiveStudioToken()).toBe("saved-studio")
  })

  it("legacy: worker token reuses a saved studio token", async () => {
    await saveLegacy({ portrait_studio_token: "saved-studio" })
    const mod = await import("./studio-settings-store")
    expect(mod.getEffectivePortraitWorkerToken()).toBe("saved-studio")
  })

  it("does not write env values into site_settings", async () => {
    process.env.PORTRAIT_STUDIO_TOKEN = "env-studio"
    process.env.PORTRAIT_WORKER_TOKEN = "env-worker"
    const mod = await import("./studio-settings-store")
    mod.getEffectiveStudioToken()
    mod.getEffectivePortraitWorkerToken()
    const store = await import("./site-settings-store")
    expect(store.getSiteSetting("portrait_studio_token")).toBeNull()
    expect(store.getSiteSetting("portrait_worker_token")).toBeNull()
  })
})
