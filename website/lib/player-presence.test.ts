import {
  offlineFromAccounts,
  resetPlayerPresenceCache,
} from "@/lib/player-presence"
import { afterEach, describe, expect, it } from "vitest"

describe("player presence math", () => {
  afterEach(() => {
    resetPlayerPresenceCache()
  })

  it("computes offline as accounts minus online", () => {
    expect(offlineFromAccounts(40, 3)).toBe(37)
    expect(offlineFromAccounts(2, 5)).toBe(0)
  })
})
