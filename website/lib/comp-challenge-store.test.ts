import { describe, expect, it } from "vitest"

import {
  forgetChallenge,
  rememberChallenge,
  resolveChallenge,
} from "@/lib/comp-challenge-store"

describe("comp-challenge-store", () => {
  it("prefers remembered challenge over cookie", () => {
    rememberChallenge("Alice", "from-memory")
    expect(resolveChallenge("alice", "from-cookie")).toBe("from-memory")
    forgetChallenge("ALICE")
    expect(resolveChallenge("alice", "from-cookie")).toBe("from-cookie")
  })
})
