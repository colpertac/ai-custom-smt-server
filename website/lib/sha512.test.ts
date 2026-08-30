import { describe, expect, it } from "vitest"

import {
  challengeReply,
  passwordHash,
  sha512Hex,
} from "@/lib/sha512"

describe("sha512 COMP auth helpers", () => {
  it("sha512Hex is stable lowercase hex", () => {
    const digest = sha512Hex("hello")
    expect(digest).toMatch(/^[0-9a-f]{128}$/)
    expect(digest).toBe(sha512Hex("hello"))
  })

  it("passwordHash is SHA-512(password + salt)", () => {
    expect(passwordHash("secret", "salt")).toBe(sha512Hex("secretsalt"))
  })

  it("challengeReply is SHA-512(passwordHash + challenge)", () => {
    const hash = passwordHash("secret", "salt")
    const reply = challengeReply(hash, "chal")
    expect(reply).toBe(sha512Hex(hash + "chal"))
  })

  it("matches the COMP challenge-response chain for a known pair", () => {
    const salt = "abc"
    const challenge = "def"
    const password = "hunter2"
    const hash = passwordHash(password, salt)
    const reply = challengeReply(hash, challenge)
    // Second round uses same password hash + new challenge from server
    const next = challengeReply(hash, "ghi")
    expect(reply).not.toBe(next)
    expect(reply).toHaveLength(128)
  })
})
