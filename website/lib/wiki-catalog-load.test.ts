import { afterEach, describe, expect, it } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  clearWikiCatalogCache,
  loadWikiItemsPayload,
  resolveWikiRuntimeRoot,
} from "@/lib/wiki-catalog-load"

describe("wiki-catalog-load", () => {
  const prevOps = process.env.OPS_RUNTIME
  const prevComp = process.env.COMP_RUNTIME
  let tmp: string | null = null

  afterEach(() => {
    clearWikiCatalogCache()
    if (prevOps === undefined) delete process.env.OPS_RUNTIME
    else process.env.OPS_RUNTIME = prevOps
    if (prevComp === undefined) delete process.env.COMP_RUNTIME
    else process.env.COMP_RUNTIME = prevComp
    if (tmp) {
      rmSync(tmp, { recursive: true, force: true })
      tmp = null
    }
  })

  it("defaults to sibling comp_hack/runtime when env is unset", () => {
    delete process.env.OPS_RUNTIME
    delete process.env.COMP_RUNTIME
    expect(resolveWikiRuntimeRoot().replace(/\\/g, "/")).toMatch(
      /\/comp_hack\/runtime$/
    )
  })

  it("falls back to baked catalog when runtime wiki is missing", () => {
    tmp = mkdtempSync(path.join(tmpdir(), "wiki-load-"))
    process.env.OPS_RUNTIME = tmp
    delete process.env.COMP_RUNTIME
    clearWikiCatalogCache()
    const { data, source } = loadWikiItemsPayload()
    expect(source).toBe("bundled")
    expect(data.items.length).toBeGreaterThan(100)
  })

  it("prefers runtime wiki/items.json when present", () => {
    tmp = mkdtempSync(path.join(tmpdir(), "wiki-load-"))
    const wiki = path.join(tmp, "wiki")
    mkdirSync(wiki, { recursive: true })
    writeFileSync(
      path.join(wiki, "items.json"),
      JSON.stringify({
        source: "test",
        namesSource: "test",
        generatedAt: "2026-09-05T00:00:00Z",
        note: "runtime",
        items: [
          {
            id: 999001,
            name: "Runtime Only Item",
            description: "",
            icon: 0,
            equipType: "EQUIP_TYPE_NONE",
            equipSlot: "None",
            weaponType: null,
            gender: 2,
            genderLabel: "Any",
            buyPrice: 0,
            sellPrice: 0,
            level: 0,
            durability: 0,
            stackSize: 1,
            stats: [],
          },
        ],
      }),
      "utf-8"
    )
    process.env.OPS_RUNTIME = tmp
    delete process.env.COMP_RUNTIME
    clearWikiCatalogCache()
    const { data, source } = loadWikiItemsPayload()
    expect(source).toBe("runtime")
    expect(data.items).toHaveLength(1)
    expect(data.items[0]?.id).toBe(999001)
  })
})
