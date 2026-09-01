import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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

const tempDirs: string[] = []

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
  tempDirs.push(dir)
  process.env.COMP_SHOPS_DIR = dir
  return fn()
}

describe("importWorkingShopFromXml", () => {
  it("imports XML with the original ShopID when free", async () => {
    await withTempShopsDir(async () => {
      const shop = emptyCompShop(6001, "DCO")
      shop.tabs[0].products.push({ productId: 1, basePrice: 10, passthrough: [] })
      const xml = serializeCompShop(shop)

      const result = await importWorkingShopFromXml(xml, "compshop 1 reku DCO.xml")

      expect(result.shopId).toBe(6001)
      expect(result.shopIdChanged).toBe(false)
      expect(result.warnings).toEqual([])
      const saved = await readWorkingShop(6001)
      expect(saved.name).toBe("DCO")
    })
  })

  it("reassigns ShopID when the preferred id already exists", async () => {
    await withTempShopsDir(async () => {
      await writeWorkingShop(emptyCompShop(6001, "Existing"))

      const shop = emptyCompShop(6001, "Imported")
      shop.tabs[0].products.push({ productId: 2, basePrice: 5, passthrough: [] })
      const xml = serializeCompShop(shop)

      const result = await importWorkingShopFromXml(xml, "duplicate.xml")

      expect(result.shopId).toBe(6002)
      expect(result.originalShopId).toBe(6001)
      expect(result.shopIdChanged).toBe(true)
      expect(result.warnings[0]).toContain("6001")
      expect(result.warnings[0]).toContain("6002")
      const saved = await readWorkingShop(6002)
      expect(saved.name).toBe("Imported")
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
      const xml = serializeCompShop(shop)
      await importWorkingShopFromXml(xml, "custom-name.xml")

      const dir = process.env.COMP_SHOPS_DIR!
      const contents = await readFile(
        path.join(dir, shopFilename(77)),
        "utf8"
      )
      expect(contents).toContain("<member name=\"ShopID\">77</member>")
    })
  })
})
