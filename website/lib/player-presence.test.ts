import {
  offlineFromAccounts,
  realOnlineCount,
  resetPlayerPresenceCache,
} from "@/lib/player-presence"
import { afterEach, describe, expect, it } from "vitest"

describe("player presence math", () => {
  afterEach(() => {
    resetPlayerPresenceCache()
  })

  it("subtracts studio mannequins from lobby online total", () => {
    expect(realOnlineCount(5, 2)).toBe(3)
    expect(realOnlineCount(1, 2)).toBe(0)
    expect(realOnlineCount(0, 0)).toBe(0)
  })

  it("computes offline as accounts minus online", () => {
    expect(offlineFromAccounts(40, 3)).toBe(37)
    expect(offlineFromAccounts(2, 5)).toBe(0)
  })
})
