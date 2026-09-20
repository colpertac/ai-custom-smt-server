import { createHash } from "node:crypto"
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  mergeStockWithIdentity,
  preserveKeysFor,
} from "@/lib/recovery/stock-knobs"
import type { ConfigValue } from "@/lib/server-config/types"

describe("mergeStockWithIdentity", () => {
  it("keeps live ExternalIP and DiffieHellman while taking stock knobs", () => {
    const stock: Record<string, ConfigValue> = {
      DiffieHellmanKeyPair: "STOCK_DH",
      ExternalIP: "0.0.0.0",
      WorldIP: "127.0.0.1",
      Name: "Stock Channel",
      Timeout: 30,
      SystemMessage: "stock banner",
    }
    const live: Record<string, ConfigValue> = {
      DiffieHellmanKeyPair: "LIVE_DH_SECRET",
      ExternalIP: "132.145.174.34",
      WorldIP: "10.0.0.2",
      StudioToken: "studio-secret",
      StudioHttpPort: 14700,
      Name: "Live Channel",
      Timeout: 99,
      SystemMessage: "live banner",
    }
    const merged = mergeStockWithIdentity(
      stock,
      live,
      preserveKeysFor("channel")
    )
    expect(merged.DiffieHellmanKeyPair).toBe("LIVE_DH_SECRET")
    expect(merged.ExternalIP).toBe("132.145.174.34")
    expect(merged.WorldIP).toBe("10.0.0.2")
    expect(merged.StudioToken).toBe("studio-secret")
    expect(merged.StudioHttpPort).toBe(14700)
    expect(merged.Name).toBe("Live Channel")
    expect(merged.Timeout).toBe(30)
    expect(merged.SystemMessage).toBe("stock banner")
  })

  it("preserves nested SQLite3Config from live for lobby", () => {
    const stock: Record<string, ConfigValue> = {
      DatabaseType: "SQLITE3",
      SQLite3Config: {
        __kind: "object",
        members: { FileDirectory: "stock/" },
      },
      WebListeningPort: 1,
      CharacterDeletionDelay: 0,
    }
    const live: Record<string, ConfigValue> = {
      DatabaseType: "SQLITE3",
      SQLite3Config: {
        __kind: "object",
        members: { FileDirectory: "database/" },
      },
      WebListeningPort: 10999,
      CharacterDeletionDelay: 7,
    }
    const merged = mergeStockWithIdentity(
      stock,
      live,
      preserveKeysFor("lobby")
    )
    expect(merged.WebListeningPort).toBe(10999)
    expect(merged.CharacterDeletionDelay).toBe(0)
    expect(merged.SQLite3Config).toEqual({
      __kind: "object",
      members: { FileDirectory: "database/" },
    })
  })

  it("does not mutate stock input", () => {
    const stock: Record<string, ConfigValue> = {
      Timeout: 30,
      DiffieHellmanKeyPair: "S",
    }
    const live: Record<string, ConfigValue> = {
      DiffieHellmanKeyPair: "L",
      Timeout: 1,
    }
    mergeStockWithIdentity(stock, live, ["DiffieHellmanKeyPair"])
    expect(stock.DiffieHellmanKeyPair).toBe("S")
    expect(stock.Timeout).toBe(30)
  })

  it("channel preserve keys omit SQLite3Config (not in ChannelConfig schema)", () => {
    expect(preserveKeysFor("channel")).not.toContain("SQLite3Config")
    expect(preserveKeysFor("channel")).not.toContain("MariaDBConfig")
    expect(preserveKeysFor("lobby")).toContain("SQLite3Config")
    expect(preserveKeysFor("world")).toContain("SQLite3Config")
  })
})

describe("createRecoverySnapshot", () => {
  let tmp: string

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "smt-recovery-"))
    const runtime = path.join(tmp, "runtime")
    const config = path.join(runtime, "config")
    const shops = path.join(runtime, "datastore", "shops")
    const packages = path.join(runtime, "datastore", "packages")
    await mkdir(config, { recursive: true })
    await mkdir(shops, { recursive: true })
    await mkdir(packages, { recursive: true })
    await writeFile(path.join(config, "lobby.xml"), "<lobby/>", "utf8")
    await writeFile(path.join(config, "world.xml"), "<world/>", "utf8")
    await writeFile(path.join(config, "channel.xml"), "<channel/>", "utf8")
    await writeFile(path.join(config, "constants.xml"), "<constants/>", "utf8")
    await writeFile(
      path.join(shops, "compshop-1.xml"),
      "<shop id=\"1\"/>",
      "utf8"
    )
    await writeFile(
      path.join(packages, "zzz_ai_custom_payouts_admin.zip"),
      "zip-bytes",
      "utf8"
    )

    vi.stubEnv("OPS_RUNTIME", runtime)
    vi.stubEnv("COMP_CONFIG_LIVE_DIR", config)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("writes manifest with hashed config and lane-a files", async () => {
    const { createRecoverySnapshot } = await import("@/lib/recovery/snapshot")
    const manifest = await createRecoverySnapshot({
      actor: "admin",
      reason: "test",
    })
    expect(manifest.actor).toBe("admin")
    expect(manifest.reason).toBe("test")
    expect(manifest.files.length).toBeGreaterThanOrEqual(5)

    const paths = manifest.files.map((f) => f.path)
    expect(paths).toContain("config/lobby.xml")
    expect(paths).toContain("config/channel.xml")
    expect(paths).toContain("lane-a/shops/compshop-1.xml")
    expect(paths).toContain("lane-a/packages/zzz_ai_custom_payouts_admin.zip")

    const lobby = manifest.files.find((f) => f.path === "config/lobby.xml")
    expect(lobby?.sha256).toBe(
      createHash("sha256").update("<lobby/>").digest("hex")
    )

    const raw = await readFile(
      path.join(
        process.env.OPS_RUNTIME!,
        "releases",
        "recovery",
        manifest.id,
        "manifest.json"
      ),
      "utf8"
    )
    expect(JSON.parse(raw).id).toBe(manifest.id)
  })
})
