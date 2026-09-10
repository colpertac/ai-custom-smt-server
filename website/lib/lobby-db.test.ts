import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DatabaseSync } from "./node-sqlite.ts"
import { passwordHash } from "@/lib/sha512"

describe("verifyLobbyAdminPassword", () => {
  let dir: string
  let dbPath: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-lobby-db-"))
    dbPath = path.join(dir, "comp_hack.sqlite3")
    process.env.COMP_LOBBY_DB = dbPath

    const db = new DatabaseSync(dbPath)
    db.exec(`
      CREATE TABLE Account (
        UID TEXT PRIMARY KEY,
        Username TEXT NOT NULL UNIQUE,
        DisplayName TEXT,
        Password TEXT NOT NULL,
        Salt TEXT NOT NULL,
        UserLevel INTEGER,
        Enabled INTEGER
      )
    `)

    const salt = "12345"
    // Known COMP vector: HashPassword("test", "12345")
    const adminHash = passwordHash("test", salt)
    db.prepare(
      `INSERT INTO Account (UID, Username, DisplayName, Password, Salt, UserLevel, Enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("u-admin", "admin", "Admin", adminHash, salt, 1000, 1)

    const playerHash = passwordHash("hunter2", salt)
    db.prepare(
      `INSERT INTO Account (UID, Username, DisplayName, Password, Salt, UserLevel, Enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("u-player", "player", "Player", playerHash, salt, 0, 1)

    const disabledHash = passwordHash("test", salt)
    db.prepare(
      `INSERT INTO Account (UID, Username, DisplayName, Password, Salt, UserLevel, Enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("u-disabled", "disabled", "Disabled", disabledHash, salt, 1000, 0)

    db.close()
  })

  afterEach(async () => {
    const { resetLobbyDbCache } = await import("@/lib/lobby-db")
    resetLobbyDbCache()
    fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.COMP_LOBBY_DB
  })

  it("accepts enabled admin with correct password", async () => {
    const { verifyLobbyAdminPassword, resetLobbyDbCache } = await import(
      "@/lib/lobby-db"
    )
    resetLobbyDbCache()
    const result = verifyLobbyAdminPassword("Admin", "test")
    expect(result).toEqual({
      ok: true,
      username: "admin",
      passwordHash: passwordHash("test", "12345"),
      userLevel: 1000,
      dispName: "Admin",
    })
  })

  it("rejects wrong password", async () => {
    const { verifyLobbyAdminPassword, resetLobbyDbCache } = await import(
      "@/lib/lobby-db"
    )
    resetLobbyDbCache()
    expect(verifyLobbyAdminPassword("admin", "wrong")).toEqual({
      ok: false,
      reason: "bad_password",
    })
  })

  it("rejects non-admin accounts", async () => {
    const { verifyLobbyAdminPassword, resetLobbyDbCache } = await import(
      "@/lib/lobby-db"
    )
    resetLobbyDbCache()
    expect(verifyLobbyAdminPassword("player", "hunter2")).toEqual({
      ok: false,
      reason: "not_admin",
    })
  })

  it("rejects disabled admins", async () => {
    const { verifyLobbyAdminPassword, resetLobbyDbCache } = await import(
      "@/lib/lobby-db"
    )
    resetLobbyDbCache()
    expect(verifyLobbyAdminPassword("disabled", "test")).toEqual({
      ok: false,
      reason: "disabled",
    })
  })

  it("rejects missing accounts", async () => {
    const { verifyLobbyAdminPassword, resetLobbyDbCache } = await import(
      "@/lib/lobby-db"
    )
    resetLobbyDbCache()
    expect(verifyLobbyAdminPassword("nobody", "test")).toEqual({
      ok: false,
      reason: "not_found",
    })
  })

  it("returns missing_db when sqlite file is absent", async () => {
    const { verifyLobbyAdminPassword, resetLobbyDbCache } = await import(
      "@/lib/lobby-db"
    )
    resetLobbyDbCache()
    process.env.COMP_LOBBY_DB = path.join(dir, "does-not-exist.sqlite3")
    expect(verifyLobbyAdminPassword("admin", "test")).toEqual({
      ok: false,
      reason: "missing_db",
    })
  })
})
