import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  clearAtlasCloudApiKey,
  getAtlasCloudApiKey,
  getAtlasCloudApiKeyStatus,
  hasAtlasCloudApiKey,
  setAtlasCloudApiKey,
  setAskLlmEnabled,
  isAskLlmEnabled,
} from "@/lib/ask-atlas-settings-store"

describe("ask-atlas-settings-store", () => {
  let dataDir: string
  const prevData = process.env.WEBSITE_DATA_DIR
  const prevEnvKey = process.env.ATLASCLOUD_API_KEY

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ask-atlas-"))
    process.env.WEBSITE_DATA_DIR = dataDir
    delete process.env.ATLASCLOUD_API_KEY
    clearAtlasCloudApiKey()
    setAskLlmEnabled(true)
  })

  afterEach(() => {
    if (prevData === undefined) delete process.env.WEBSITE_DATA_DIR
    else process.env.WEBSITE_DATA_DIR = prevData
    if (prevEnvKey === undefined) delete process.env.ATLASCLOUD_API_KEY
    else process.env.ATLASCLOUD_API_KEY = prevEnvKey
  })

  it("masks stored keys in status (never full key)", () => {
    setAtlasCloudApiKey("sk-test-secret-abcd")
    const status = getAtlasCloudApiKeyStatus()
    expect(status.configured).toBe(true)
    expect(status.hint).toBe("…abcd")
    expect(status.hint).not.toContain("secret")
  })

  it("prefers site_settings over env fallback", () => {
    process.env.ATLASCLOUD_API_KEY = "env-key-1234"
    setAtlasCloudApiKey("db-key-5678")
    expect(getAtlasCloudApiKey()).toBe("db-key-5678")
    expect(hasAtlasCloudApiKey()).toBe(true)
  })

  it("falls back to env when db key cleared", () => {
    setAtlasCloudApiKey("db-key-5678")
    clearAtlasCloudApiKey()
    process.env.ATLASCLOUD_API_KEY = "env-only-wxyz"
    expect(getAtlasCloudApiKey()).toBe("env-only-wxyz")
    expect(getAtlasCloudApiKeyStatus().hint).toBe("…wxyz")
  })

  it("tracks ask LLM enabled flag", () => {
    setAtlasCloudApiKey("sk-enabled-test1234")
    setAskLlmEnabled(false)
    expect(isAskLlmEnabled()).toBe(false)
    setAskLlmEnabled(true)
    expect(isAskLlmEnabled()).toBe(true)
  })
})
