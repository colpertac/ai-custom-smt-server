import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  parseCompShopXml,
  serializeCompShop,
  shopsEqual,
  type CompShop,
} from "@/lib/comp-shop-xml"
import { resolveShopProduct } from "@/lib/shop-products"

const here = path.dirname(fileURLToPath(import.meta.url))
const shopsDir = path.resolve(
  here,
  "../../server-content/shops"
)

function loadShop(name: string): string {
  return readFileSync(path.join(shopsDir, name), "utf8")
}

describe("comp-shop-xml round-trip", () => {
  it("preserves 641 known fields through parse → serialize → parse", () => {
    const xml = loadShop("compshop-641.xml")
    const a = parseCompShopXml(xml, "compshop-641.xml")
    expect(a.shopId).toBe(641)
    expect(a.type).toBe("COMP_SHOP")
    expect(a.tabs).toHaveLength(2)
    expect(a.tabs[0].products[0]).toMatchObject({
      productId: 12063,
      basePrice: 3,
      merchantDescription: 31,
    })

    const again = parseCompShopXml(serializeCompShop(a), a.filename)
    expect(shopsEqual(a, again)).toBe(true)
  })

  it("preserves MoonRestrict on larger shop 301", () => {
    const xml = loadShop("compshop-301.xml")
    const a = parseCompShopXml(xml, "compshop-301.xml")
    expect(a.shopId).toBe(301)
    const withMoon = a.tabs
      .flatMap((t) => t.products)
      .filter((p) => p.moonRestrict)
    expect(withMoon.length).toBeGreaterThan(0)
    expect(withMoon[0].moonRestrict).toMatch(/^0x/i)

    const again = parseCompShopXml(serializeCompShop(a), a.filename)
    expect(shopsEqual(a, again)).toBe(true)
  })

  it("round-trips unknown product members", () => {
    const shop: CompShop = {
      shopId: 999,
      name: "Test",
      type: "COMP_SHOP",
      filename: "compshop-999.xml",
      passthrough: [
        {
          name: "RepairRate",
          content: "1.5",
          complex: false,
        },
      ],
      tabs: [
        {
          name: "Tab",
          passthrough: [],
          products: [
            {
              productId: 1,
              basePrice: 10,
              passthrough: [
                {
                  name: "TrendDisabled",
                  content: "true",
                  complex: false,
                },
              ],
            },
          ],
        },
      ],
    }
    const again = parseCompShopXml(serializeCompShop(shop))
    expect(again.passthrough).toEqual([
      { name: "RepairRate", content: "1.5", complex: false },
    ])
    expect(again.tabs[0].products[0].passthrough).toEqual([
      { name: "TrendDisabled", content: "true", complex: false },
    ])
  })
})

describe("shop product resolve", () => {
  it("resolves ProductID from fixture map", () => {
    const products = {
      "12063": {
        itemId: 12063,
        stack: 1,
        isCp: true,
        name: "COMP expansion card α （1 Day）",
      },
    }
    expect(resolveShopProduct(products, 12063)).toEqual(products["12063"])
    expect(resolveShopProduct(products, 99999)).toBeNull()
  })
})
