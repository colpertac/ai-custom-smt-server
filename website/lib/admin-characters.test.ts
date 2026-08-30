import { afterEach, describe, expect, it } from "vitest"

import { listCharactersByUsername } from "@/lib/admin-characters"
import { resetLobbyDbCache } from "@/lib/lobby-db"
import { resetWorldDbCache } from "@/lib/world-db"

describe("listCharactersByUsername", () => {
  afterEach(() => {
    resetLobbyDbCache()
    resetWorldDbCache()
  })

  it("returns null for unknown username", () => {
    expect(listCharactersByUsername("no-such-user-zzz")).toBeNull()
  })

  it("lists world characters for an existing account", () => {
    const chars = listCharactersByUsername("catm")
    expect(chars).not.toBeNull()
    expect(chars!.length).toBeGreaterThan(0)
    expect(chars!.some((c) => c.name === "catm")).toBe(true)
    expect(chars!.every((c) => typeof c.level === "number")).toBe(true)
  })
})
