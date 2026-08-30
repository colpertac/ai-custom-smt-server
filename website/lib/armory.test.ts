import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  decodeEquippedItemUids,
  isValidCharacterName,
  loadArmoryProfile,
  uuidBytesToString,
} from "@/lib/armory"
import { resetPortraitQueueForTests } from "@/lib/portrait-queue"
import { getWorldDbPath } from "@/lib/world-db"

describe("uuidBytesToString", () => {
  it("formats 16 bytes as dashed UUID", () => {
    const hex = "c097ef38cf674cecaab3cdd8e96125de"
    expect(uuidBytesToString(Buffer.from(hex, "hex"))).toBe(
      "c097ef38-cf67-4cec-aab3-cdd8e96125de"
    )
  })

  it("returns null for null UUID", () => {
    expect(uuidBytesToString(Buffer.alloc(16, 0))).toBeNull()
  })
})

describe("decodeEquippedItemUids", () => {
  it("decodes 15 slots from a 240-byte blob", () => {
    const blob = Buffer.alloc(240, 0)
    const uid = Buffer.from("c097ef38cf674cecaab3cdd8e96125de", "hex")
    uid.copy(blob, 3 * 16)
    const slots = decodeEquippedItemUids(blob)
    expect(slots[3]).toBe("c097ef38-cf67-4cec-aab3-cdd8e96125de")
    expect(slots[0]).toBeNull()
    expect(slots).toHaveLength(15)
  })
})

describe("isValidCharacterName", () => {
  it("accepts typical names", () => {
    expect(isValidCharacterName("admin")).toBe(true)
    expect(isValidCharacterName("Dark_Knight")).toBe(true)
  })

  it("rejects empty, overlong, or path junk", () => {
    expect(isValidCharacterName("")).toBe(false)
    expect(isValidCharacterName("a".repeat(33))).toBe(false)
    expect(isValidCharacterName("../etc")).toBe(false)
    expect(isValidCharacterName("a/b")).toBe(false)
  })
})

describe("loadArmoryProfile", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-armory-"))
    process.env.WEBSITE_DATA_DIR = dataDir
    resetPortraitQueueForTests()
  })

  afterEach(() => {
    resetPortraitQueueForTests()
    fs.rmSync(dataDir, { recursive: true, force: true })
    delete process.env.WEBSITE_DATA_DIR
  })

  it("loads admin from local world DB when present", () => {
    if (!fs.existsSync(getWorldDbPath())) return
    const profile = loadArmoryProfile("admin")
    expect(profile).not.toBeNull()
    expect(profile!.name).toBe("admin")
    expect(profile!.stats?.level).toBeGreaterThan(0)
    expect(profile!.stats?.clsr).toBeDefined()
    expect(profile!.stats?.maxHp).toBeGreaterThan(0)
    expect(profile!.equipment.some((e) => e.itemType != null)).toBe(true)
    expect(profile!.expertises).toBeDefined()
    expect(profile).not.toHaveProperty("account")
    expect(JSON.stringify(profile)).not.toMatch(/Account/i)
    expect(profile!.portraitFingerprint).toMatch(/^[0-9a-f]{16}$/)
    expect(["ready", "queued", "missing"]).toContain(profile!.portraitStatus)
  })
})
