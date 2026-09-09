import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  emptyCompShop,
  importWorkingShopFromXml,
  readWorkingShop,
  resolveAvailableShopId,
  shopFilename,
  writeWorkingShop,
} from "@/lib/comp-shops-fs"
import { serializeCompShop } from "@/lib/comp-shop-xml"

beforeEach(() => {
  process.env.COMP_SHOPS_DIR = ""
})

afterEach(async () => {
  const dir = process.env.COMP_SHOPS_DIR
  process.env.COMP_SHOPS_DIR = ""
  if (dir) {
    await rm(dir, { recursive: true, force: true })
  }
})

async function withTempShopsDir<T>(fn: () => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "comp-shops-import-"))
  process.env.COMP_SHOPS_DIR = dir
  return fn()
}

describe("importWorkingShopFromXml", () => {
  it("allocates ShopID from floor when working copy is empty", async () => {
    await withTempShopsDir(async () => {
      const shop = emptyCompShop(42, "DCO")
      shop.tabs[0]!.products.push({
        productId: 1,
        basePrice: 10,
        passthrough: [],
      })
      const xml = serializeCompShop(shop)

      const result = await importWorkingShopFromXml(
        xml,
        "compshop 1 reku DCO.xml"
      )

      expect(result.shopId).toBe(6001)
      expect(result.originalShopId).toBe(42)
      expect(result.shopIdChanged).toBe(true)
      expect(result.warnings[0]).toContain("6001")
      expect(result.warnings[0]).toContain("42")
      const saved = await readWorkingShop(6001)
      expect(saved.name).toBe("DCO")
    })
  })

  it("never reuses an existing working-copy ShopID", async () => {
    await withTempShopsDir(async () => {
      await writeWorkingShop(emptyCompShop(6001, "Existing"))

      const shop = emptyCompShop(6001, "Imported")
      shop.tabs[0]!.products.push({
        productId: 2,
        basePrice: 5,
        passthrough: [],
      })
      const xml = serializeCompShop(shop)

      const result = await importWorkingShopFromXml(xml, "legacy-name.xml")

      expect(result.shopId).toBe(6002)
      expect(result.originalShopId).toBe(6001)
      expect(result.shopIdChanged).toBe(true)
      const saved = await readWorkingShop(6002)
      expect(saved.name).toBe("Imported")
    })
  })

  it("batches sequential uploads to distinct new ids", async () => {
    await withTempShopsDir(async () => {
      const a = emptyCompShop(1, "A")
      a.tabs[0]!.products.push({ productId: 1, basePrice: 1, passthrough: [] })
      const b = emptyCompShop(1, "B")
      b.tabs[0]!.products.push({ productId: 2, basePrice: 2, passthrough: [] })

      const r1 = await importWorkingShopFromXml(serializeCompShop(a), "a.xml")
      const r2 = await importWorkingShopFromXml(serializeCompShop(b), "b.xml")

      expect(r1.shopId).toBe(6001)
      expect(r2.shopId).toBe(6002)
      expect(r1.name).toBe("A")
      expect(r2.name).toBe("B")
    })
  })

  it("resolveAvailableShopId picks max+1 above existing shops", async () => {
    await withTempShopsDir(async () => {
      await writeWorkingShop(emptyCompShop(641, "A"))
      await writeWorkingShop(emptyCompShop(9000, "B"))

      const free = await resolveAvailableShopId(641)
      expect(free).toEqual({ shopId: 9001, changed: true })

      const fresh = await resolveAvailableShopId(42)
      expect(fresh).toEqual({ shopId: 42, changed: false })
    })
  })

  it("writes compshop-{id}.xml for the assigned ShopID", async () => {
    await withTempShopsDir(async () => {
      const shop = emptyCompShop(77, "Seventy-seven")
      shop.tabs[0]!.products.push({
        productId: 1,
        basePrice: 0,
        passthrough: [],
      })
      const result = await importWorkingShopFromXml(
        serializeCompShop(shop),
        "custom-name.xml"
      )

      expect(result.shopId).toBe(6001)
      const dir = process.env.COMP_SHOPS_DIR!
      const contents = await readFile(
        path.join(dir, shopFilename(6001)),
        "utf8"
      )
      expect(contents).toContain('<member name="ShopID">6001</member>')
    })
  })
})
