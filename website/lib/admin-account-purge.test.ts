import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { DatabaseSync } from "./node-sqlite.ts"

describe("purgeWorldDataForUsername", () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "smt-account-purge-"))
    const lobbyPath = path.join(dir, "lobby.sqlite3")
    const worldPath = path.join(dir, "world.sqlite3")
    process.env.COMP_LOBBY_DB = lobbyPath
    process.env.COMP_WORLD_DB = worldPath

    const lobby = new DatabaseSync(lobbyPath)
    lobby.exec(`
      CREATE TABLE Account (
        UID TEXT PRIMARY KEY,
        Username TEXT NOT NULL UNIQUE
      )
    `)
    lobby
      .prepare(`INSERT INTO Account (UID, Username) VALUES (?, ?)`)
      .run("acct-purge-1", "purgeuser")
    lobby
      .prepare(`INSERT INTO Account (UID, Username) VALUES (?, ?)`)
      .run("acct-keep-1", "keepuser")
    lobby.close()

    const world = new DatabaseSync(worldPath)
    world.exec(`
      CREATE TABLE Character (
        UID TEXT PRIMARY KEY,
        Name TEXT,
        Account TEXT,
        CoreStats TEXT,
        Progress TEXT,
        COMP TEXT
      );
      CREATE TABLE EntityStats (
        UID TEXT PRIMARY KEY,
        Level INTEGER
      );
      CREATE TABLE CharacterProgress (
        UID TEXT PRIMARY KEY
      );
      CREATE TABLE ItemBox (
        UID TEXT PRIMARY KEY,
        Account TEXT,
        Character TEXT
      );
      CREATE TABLE Item (
        UID TEXT PRIMARY KEY,
        ItemBox TEXT
      );
      CREATE TABLE DemonBox (
        UID TEXT PRIMARY KEY,
        Account TEXT,
        Character TEXT
      );
      CREATE TABLE Demon (
        UID TEXT PRIMARY KEY,
        DemonBox TEXT
      );
      CREATE TABLE InheritedSkill (
        UID TEXT PRIMARY KEY,
        Demon TEXT
      );
      CREATE TABLE Hotbar (
        UID TEXT PRIMARY KEY,
        Character TEXT
      );
      CREATE TABLE AccountWorldData (
        UID TEXT PRIMARY KEY,
        Account TEXT
      );
      CREATE TABLE ChatLogEntry (
        UID TEXT PRIMARY KEY,
        Account TEXT,
        Character TEXT
      );
    `)

    world
      .prepare(
        `INSERT INTO EntityStats (UID, Level) VALUES (?, ?)`
      )
      .run("stats-1", 12)
    world.prepare(`INSERT INTO CharacterProgress (UID) VALUES (?)`).run("prog-1")
    world
      .prepare(
        `INSERT INTO Character (UID, Name, Account, CoreStats, Progress, COMP)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "char-1",
        "PurgeChar",
        "acct-purge-1",
        "stats-1",
        "prog-1",
        "dbox-1"
      )
    world
      .prepare(
        `INSERT INTO ItemBox (UID, Account, Character) VALUES (?, ?, ?)`
      )
      .run("ibox-1", "acct-purge-1", "char-1")
    world
      .prepare(`INSERT INTO Item (UID, ItemBox) VALUES (?, ?)`)
      .run("item-1", "ibox-1")
    world
      .prepare(
        `INSERT INTO DemonBox (UID, Account, Character) VALUES (?, ?, ?)`
      )
      .run("dbox-1", "acct-purge-1", "char-1")
    world
      .prepare(`INSERT INTO Demon (UID, DemonBox) VALUES (?, ?)`)
      .run("demon-1", "dbox-1")
    world
      .prepare(`INSERT INTO InheritedSkill (UID, Demon) VALUES (?, ?)`)
      .run("iskill-1", "demon-1")
    world
      .prepare(`INSERT INTO Hotbar (UID, Character) VALUES (?, ?)`)
      .run("hot-1", "char-1")
    world
      .prepare(
        `INSERT INTO AccountWorldData (UID, Account) VALUES (?, ?)`
      )
      .run("acct-purge-1", "acct-purge-1")
    world
      .prepare(
        `INSERT INTO ChatLogEntry (UID, Account, Character) VALUES (?, ?, ?)`
      )
      .run("chat-1", "acct-purge-1", "char-1")

    // Untouched account character
    world
      .prepare(
        `INSERT INTO EntityStats (UID, Level) VALUES (?, ?)`
      )
      .run("stats-keep", 5)
    world
      .prepare(
        `INSERT INTO Character (UID, Name, Account, CoreStats, Progress, COMP)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        "char-keep",
        "KeepChar",
        "acct-keep-1",
        "stats-keep",
        "00000000-0000-0000-0000-000000000000",
        "00000000-0000-0000-0000-000000000000"
      )

    world.close()
  })

  afterEach(async () => {
    const { resetLobbyDbCache } = await import("@/lib/lobby-db")
    const { resetWorldDbCache } = await import("@/lib/world-db")
    resetLobbyDbCache()
    resetWorldDbCache()
    fs.rmSync(dir, { recursive: true, force: true })
    delete process.env.COMP_LOBBY_DB
    delete process.env.COMP_WORLD_DB
  })

  it("returns null for unknown username", async () => {
    const { purgeWorldDataForUsername } = await import(
      "@/lib/admin-account-purge"
    )
    expect(purgeWorldDataForUsername("no-such-user")).toBeNull()
  })

  it("removes characters and related rows for the account only", async () => {
    const { purgeWorldDataForUsername } = await import(
      "@/lib/admin-account-purge"
    )
    const { resetWorldDbCache, getWorldDb } = await import("@/lib/world-db")

    const result = purgeWorldDataForUsername("purgeuser")
    expect(result).not.toBeNull()
    expect(result!.characterNames).toEqual(["PurgeChar"])
    expect(result!.charactersDeleted).toBeGreaterThanOrEqual(1)

    resetWorldDbCache()
    const db = getWorldDb()
    expect(
      db.prepare(`SELECT COUNT(*) AS c FROM Character WHERE Name = ?`).get("PurgeChar")
    ).toEqual({ c: 0 })
    expect(
      db.prepare(`SELECT COUNT(*) AS c FROM Character WHERE Name = ?`).get("KeepChar")
    ).toEqual({ c: 1 })
    expect(db.prepare(`SELECT COUNT(*) AS c FROM Item`).get()).toEqual({ c: 0 })
    expect(db.prepare(`SELECT COUNT(*) AS c FROM Demon`).get()).toEqual({ c: 0 })
    expect(db.prepare(`SELECT COUNT(*) AS c FROM InheritedSkill`).get()).toEqual({
      c: 0,
    })
    expect(db.prepare(`SELECT COUNT(*) AS c FROM Hotbar`).get()).toEqual({ c: 0 })
    expect(db.prepare(`SELECT COUNT(*) AS c FROM AccountWorldData`).get()).toEqual({
      c: 0,
    })
    expect(
      db.prepare(`SELECT COUNT(*) AS c FROM EntityStats WHERE UID = ?`).get("stats-1")
    ).toEqual({ c: 0 })
    expect(
      db
        .prepare(`SELECT COUNT(*) AS c FROM EntityStats WHERE UID = ?`)
        .get("stats-keep")
    ).toEqual({ c: 1 })
  })
})
