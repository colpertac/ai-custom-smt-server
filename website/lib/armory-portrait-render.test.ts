import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// devil-catalog (via armory) imports server-only.
vi.mock("server-only", () => ({}))

import type { PortraitFingerprintInput } from "@/lib/armory-portrait"
import {
  avatarCharacterFromPortraitInput,
  planArmoryPortrait,
  resolveArmoryProfilePortrait,
} from "@/lib/armory-portrait-render"
import { loadAvatarCatalog } from "@/lib/avatar-catalog"
import { resolveAvatarRecipe } from "@/lib/avatar-recipe"
import { portraitFingerprintV3 } from "@/lib/portrait-fingerprint-v3"
import {
  listPortraitJobs,
  recordPortraitWorkerHeartbeat,
  resetPortraitQueueForTests,
  resetPortraitWorkersForTests,
} from "@/lib/portrait-queue"
import { RENDERER_VERSION } from "@/lib/portrait-renderer"
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

/** A fresh heartbeat from a render worker on this RENDERER_VERSION (render available). */
function workerOnline(rendererVersion = RENDERER_VERSION) {
  recordPortraitWorkerHeartbeat({
    workerId: "test",
    kind: "three",
    rendererVersion,
    assetsVersion: null,
    chrome: null,
    busy: false,
  })
}

describe("armory portrait (render worker)", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-armory-render-"))
    process.env.WEBSITE_DATA_DIR = dataDir
    resetPortraitQueueForTests()
    resetPortraitWorkersForTests()
  })

  afterEach(() => {
    resetPortraitQueueForTests()
    resetPortraitWorkersForTests()
    fs.rmSync(dataDir, { recursive: true, force: true })
    delete process.env.WEBSITE_DATA_DIR
  })

  function stub(name: string) {
    const dir = path.join(dataDir, "armory", "portraits")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${name}.png`), "x")
  }

  it("v3 fingerprint over the resolved recipe, job carries the recipe", async () => {
    workerOnline()
    const catalog = loadAvatarCatalog().data
    const recipe = resolveAvatarRecipe(avatarCharacterFromPortraitInput(look()), catalog)

    const r = await resolveArmoryProfilePortrait(look(), "cat2", { enqueue: true })
    expect(r.status).toBe("queued")
    expect(r.portrait.fingerprint).toBe(portraitFingerprintV3(recipe, catalog.version))
    const [job] = listPortraitJobs()
    expect(job!.fingerprint).toBe(r.portrait.fingerprint)
    expect(job!.payload).toMatchObject({ recipe, preset: "front", width: 768, height: 925 })

    // Same look, other name → same fingerprint (no new job).
    expect(planArmoryPortrait(look("alt"), "alt").portrait.fingerprint).toBe(
      r.portrait.fingerprint
    )
  })

  it("no enqueue when no render worker is online or enqueue is off", async () => {
    const off = await resolveArmoryProfilePortrait(look(), "cat2", { enqueue: true })
    expect(off.status).toBe("missing")
    workerOnline(RENDERER_VERSION + 1)
    const wrongVersion = await resolveArmoryProfilePortrait(look(), "cat2", {
      enqueue: true,
    })
    expect(wrongVersion.status).toBe("missing")
    workerOnline()
    const skip = await resolveArmoryProfilePortrait(look(), "cat2", { enqueue: false })
    expect(skip.status).toBe("missing")
    expect(listPortraitJobs()).toHaveLength(0)
  })

  it("serves the hash-named file only, not a name-keyed stub", async () => {
    stub("cat2")
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
    "loadArmoryProfile enqueues a recipe job (local world DB)",
    async () => {
      workerOnline()
      const { loadArmoryProfile } = await import("@/lib/armory")
      const profile = await loadArmoryProfile("admin")
      if (!profile) return
      // Empty temp portraits dir + worker online → enqueues.
      expect(profile.portraitStatus).toBe("queued")
      const job = listPortraitJobs().find(
        (j) => j.fingerprint === profile.portraitFingerprint
      )
      expect(job?.payload.recipe).toBeTruthy()
    }
  )
})
