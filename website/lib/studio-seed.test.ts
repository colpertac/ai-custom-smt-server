import { afterEach, describe, expect, it } from "vitest"

import {
  defaultVafPassword,
  defaultVamPassword,
  getStudioAccountsOverview,
  seedStudioMannequins,
} from "./studio-seed"
import { resetLobbyDbCache } from "./lobby-db"
import { resetWorldDbCache } from "./world-db"

describe("studio-seed", () => {
  afterEach(() => {
    resetLobbyDbCache()
    resetWorldDbCache()
  })

  it("returns default passwords", () => {
    expect(defaultVamPassword()).toBeTruthy()
    expect(defaultVafPassword()).toBeTruthy()
    expect(defaultVamPassword().length).toBeGreaterThanOrEqual(6)
    expect(defaultVafPassword().length).toBeGreaterThanOrEqual(6)
  })

  it("retrieves studio accounts overview", () => {
    const overview = getStudioAccountsOverview()
    expect(overview).toHaveProperty("vam1")
    expect(overview).toHaveProperty("vaf1")
    expect(overview.vam1.username).toBe("vam1")
    expect(overview.vaf1.username).toBe("vaf1")
    expect(typeof overview.vam1.exists).toBe("boolean")
    expect(typeof overview.vaf1.exists).toBe("boolean")
  })

  it("validates password length bounds", async () => {
    await expect(
      seedStudioMannequins({ vamPass: "123" })
    ).rejects.toThrow(/between 6 and 16 characters/)

    await expect(
      seedStudioMannequins({ vafPass: "toolongpassword1234567" })
    ).rejects.toThrow(/between 6 and 16 characters/)
  })

  it("seeds or updates vam1 and vaf1 accounts and characters", async () => {
    const res = await seedStudioMannequins({
      vamPass: "vam1vam1",
      vafPass: "vaf1vaf1",
    })

    expect(res.ok).toBe(true)
    expect(res.vam.account).toBe("vam1")
    expect(res.vam.character).toBe("vam")
    expect(res.vam.adminGranted).toBe(true)
    expect(res.vam.zone).toBe(10105)

    expect(res.vaf.account).toBe("vaf1")
    expect(res.vaf.character).toBe("vaf")
    expect(res.vaf.adminGranted).toBe(true)
    expect(res.vaf.zone).toBe(10105)

    expect(res.passwords.vam1).toBe("vam1vam1")
    expect(res.passwords.vaf1).toBe("vaf1vaf1")

    const after = getStudioAccountsOverview()
    expect(after.vam1.exists).toBe(true)
    expect(after.vam1.isAdmin).toBe(true)
    expect(after.vam1.enabled).toBe(true)
    expect(after.vam1.characterExists).toBe(true)
    expect(after.vam1.characterZone).toBe(10105)

    expect(after.vaf1.exists).toBe(true)
    expect(after.vaf1.isAdmin).toBe(true)
    expect(after.vaf1.enabled).toBe(true)
    expect(after.vaf1.characterExists).toBe(true)
    expect(after.vaf1.characterZone).toBe(10105)
  })
})
