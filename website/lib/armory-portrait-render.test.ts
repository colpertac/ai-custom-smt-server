import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// devil-catalog (via armory) imports server-only; the studio probe is the capture gate.
vi.mock("server-only", () => ({}))
const capture = vi.hoisted(() => ({ available: true }))
vi.mock("@/lib/studio-api", () => ({
  isPortraitCaptureAvailable: vi.fn(async () => capture.available),
}))

import { appearanceFingerprint, type PortraitFingerprintInput } from "@/lib/armory-portrait"
import {
  avatarCharacterFromPortraitInput,
  planArmoryPortrait,
  resolveArmoryProfilePortrait,
} from "@/lib/armory-portrait-render"
import { loadAvatarCatalog } from "@/lib/avatar-catalog"
import { resolveAvatarRecipe } from "@/lib/avatar-recipe"
import { portraitFingerprintV3 } from "@/lib/portrait-fingerprint-v3"
import {
  isThreePortraitPayload,
  listPortraitJobs,
  resetPortraitQueueForTests,
} from "@/lib/portrait-queue"
import { getWorldDbPath } from "@/lib/world-db"

function look(name = "cat2"): PortraitFingerprintInput {
  return {
    characterName: name,
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
    equippedItems: [{ slot: 13, itemType: 1001 }],
    weaponType: 1001,
    demonType: 0,
  }
}

describe("armory portrait enqueue by PORTRAIT_RENDERER", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-armory-render-"))
    process.env.WEBSITE_DATA_DIR = dataDir
    capture.available = true
    resetPortraitQueueForTests()
  })

  afterEach(() => {
    resetPortraitQueueForTests()
    fs.rmSync(dataDir, { recursive: true, force: true })
    delete process.env.WEBSITE_DATA_DIR
    delete process.env.PORTRAIT_RENDERER
  })

  function stub(name: string) {
    const dir = path.join(dataDir, "armory", "portraits")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${name}.png`), "x")
  }

  it("wine (default): v2 fingerprint, Wine job without recipe", async () => {
    const r = await resolveArmoryProfilePortrait(look(), "cat2", {
      enqueue: true,
      gender: 0,
    })
    expect(r.status).toBe("queued")
    expect(r.portrait.fingerprint).toBe(appearanceFingerprint(look()))
    const [job] = listPortraitJobs()
    expect(job!.fingerprint).toBe(r.portrait.fingerprint)
    expect(isThreePortraitPayload(job!.payload)).toBe(false)
  })

  it("three: v3 fingerprint over the resolved recipe, job carries the recipe", async () => {
    process.env.PORTRAIT_RENDERER = "three"
    const catalog = loadAvatarCatalog().data
    const recipe = resolveAvatarRecipe(avatarCharacterFromPortraitInput(look()), catalog)

    const r = await resolveArmoryProfilePortrait(look(), "cat2", {
      enqueue: true,
      gender: 0,
    })
    expect(r.status).toBe("queued")
    expect(r.portrait.fingerprint).toBe(portraitFingerprintV3(recipe, catalog.version))
    expect(r.portrait.fingerprint).not.toBe(appearanceFingerprint(look()))
    const [job] = listPortraitJobs()
    expect(job!.fingerprint).toBe(r.portrait.fingerprint)
    expect(isThreePortraitPayload(job!.payload)).toBe(true)
    expect(job!.payload).toMatchObject({ recipe, preset: "front", width: 768, height: 925 })

    // Same look, other name → same fingerprint (no new job).
    expect(planArmoryPortrait(look("alt"), "alt").portrait.fingerprint).toBe(
      r.portrait.fingerprint
    )
  })

  it("no enqueue when capture is unavailable or enqueue is off", async () => {
    for (const mode of ["wine", "three"]) {
      process.env.PORTRAIT_RENDERER = mode
      capture.available = false
      const off = await resolveArmoryProfilePortrait(look(), "cat2", {
        enqueue: true,
        gender: 0,
      })
      expect(off.status).toBe("missing")
      capture.available = true
      const skip = await resolveArmoryProfilePortrait(look(), "cat2", {
        enqueue: false,
        gender: 0,
      })
      expect(skip.status).toBe("missing")
    }
    expect(listPortraitJobs()).toHaveLength(0)
  })

  it("name-keyed stub is served in wine mode only; hash file in both", async () => {
    stub("cat2")
    expect(planArmoryPortrait(look(), "cat2").portrait.status).toBe("ready")
    process.env.PORTRAIT_RENDERER = "three"
    const plan = planArmoryPortrait(look(), "cat2")
    expect(plan.portrait.status).toBe("missing")
    stub(plan.portrait.fingerprint)
    expect(planArmoryPortrait(look(), "cat2").portrait).toEqual({
      fingerprint: plan.portrait.fingerprint,
      url: `/armory/portraits/${plan.portrait.fingerprint}.png`,
      status: "ready",
    })
  })

  it.skipIf(!fs.existsSync(getWorldDbPath()))(
    "loadArmoryProfile enqueues per mode (local world DB)",
    async () => {
      const { loadArmoryProfile } = await import("@/lib/armory")
      const wine = await loadArmoryProfile("admin")
      if (!wine) return
      process.env.PORTRAIT_RENDERER = "three"
      const three = await loadArmoryProfile("admin")
      expect(three!.portraitFingerprint).not.toBe(wine.portraitFingerprint)
      // Empty temp portraits dir + capture mocked on → both modes enqueue.
      expect(wine.portraitStatus).toBe("queued")
      expect(three!.portraitStatus).toBe("queued")
      const byFp = new Map(listPortraitJobs().map((j) => [j.fingerprint, j]))
      expect(isThreePortraitPayload(byFp.get(wine.portraitFingerprint)!.payload)).toBe(false)
      expect(isThreePortraitPayload(byFp.get(three!.portraitFingerprint)!.payload)).toBe(true)
    }
  )
})
