import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

describe("password-reset-store", () => {
  let dataDir: string

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-reset-"))
    process.env.WEBSITE_DATA_DIR = dataDir
  })

  afterEach(async () => {
    const mod = await import("@/lib/password-reset-store")
    mod.resetPasswordResetStoreForTests()
    fs.rmSync(dataDir, { recursive: true, force: true })
    delete process.env.WEBSITE_DATA_DIR
  })

  it("creates and consumes a token once", async () => {
    const {
      createPasswordResetToken,
      consumePasswordResetToken,
      resetPasswordResetStoreForTests,
    } = await import("@/lib/password-reset-store")
    resetPasswordResetStoreForTests()

    const { token } = createPasswordResetToken("Alice")
    expect(consumePasswordResetToken(token)).toEqual({ username: "alice" })
    expect(consumePasswordResetToken(token)).toBeNull()
  })

  it("rejects garbage tokens", async () => {
    const { consumePasswordResetToken, resetPasswordResetStoreForTests } =
      await import("@/lib/password-reset-store")
    resetPasswordResetStoreForTests()
    expect(consumePasswordResetToken("short")).toBeNull()
    expect(consumePasswordResetToken("a".repeat(64))).toBeNull()
  })
})
