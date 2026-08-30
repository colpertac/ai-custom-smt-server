import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  decodeEquippedItemUids,
  isValidCharacterName,
  loadArmoryProfile,
  listArmoryCharacters,
  scoreArmoryNameMatch,
  searchArmoryCharacters,
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

describe("scoreArmoryNameMatch", () => {
  it("ranks exact and prefix matches above substring", () => {
    expect(scoreArmoryNameMatch("cat", "cat")).toBeGreaterThan(
      scoreArmoryNameMatch("catgirl", "cat")
    )
    expect(scoreArmoryNameMatch("catgirl", "cat")).toBeGreaterThan(
      scoreArmoryNameMatch("locate", "cat")
    )
  })

  it("matches subsequence characters for fuzzy fallback", () => {
    expect(scoreArmoryNameMatch("locate", "ct")).toBeGreaterThan(0)
    expect(scoreArmoryNameMatch("xyz", "cat")).toBe(0)
  })
})

describe("searchArmoryCharacters", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-armory-search-"))
    process.env.WEBSITE_DATA_DIR = dataDir
    resetPortraitQueueForTests()
  })

  afterEach(() => {
    resetPortraitQueueForTests()
    fs.rmSync(dataDir, { recursive: true, force: true })
    delete process.env.WEBSITE_DATA_DIR
  })

  it("returns null for invalid query fragments", () => {
    expect(searchArmoryCharacters("../etc")).toBeNull()
  })

  it("finds substring matches with pagination", () => {
    if (!fs.existsSync(getWorldDbPath())) return
    const all = searchArmoryCharacters("a", { limit: 1000, offset: 0 })
    expect(all).not.toBeNull()
    if ((all?.total ?? 0) === 0) return

    const page0 = searchArmoryCharacters("a", { limit: 2, offset: 0 })
    const page1 = searchArmoryCharacters("a", { limit: 2, offset: 2 })
    expect(page0!.items.length).toBeLessThanOrEqual(2)
    expect(page0!.total).toBe(all!.total)
    if (page0!.total > 2) {
      expect(page1!.items[0]?.name).not.toBe(page0!.items[0]?.name)
    }
    expect(
      page0!.items.every((hit) => hit.name.toLowerCase().includes("a"))
    ).toBe(true)
  })
})

describe("listArmoryCharacters", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-armory-list-"))
    process.env.WEBSITE_DATA_DIR = dataDir
    resetPortraitQueueForTests()
  })

  afterEach(() => {
    resetPortraitQueueForTests()
    fs.rmSync(dataDir, { recursive: true, force: true })
    delete process.env.WEBSITE_DATA_DIR
  })

  it("lists characters alphabetically with pagination", () => {
    if (!fs.existsSync(getWorldDbPath())) return
    const all = listArmoryCharacters({ limit: 1000, offset: 0 })
    expect(all.total).toBeGreaterThan(0)

    const page0 = listArmoryCharacters({ limit: 2, offset: 0 })
    const page1 = listArmoryCharacters({ limit: 2, offset: 2 })
    expect(page0.items.length).toBeLessThanOrEqual(2)
    expect(page0.total).toBe(all.total)
    if (all.total > 2) {
      expect(page1.items[0]?.name).not.toBe(page0.items[0]?.name)
    }
    const names = page0.items.map((hit) => hit.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })))
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
