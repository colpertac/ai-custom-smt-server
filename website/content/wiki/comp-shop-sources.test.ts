import { describe, expect, it } from "vitest"

import {
  buildCompShopSourcesIndex,
  resolveListingItemId,
} from "@/scripts/wiki-export-comp-shops"

describe("wiki comp shop sources export", () => {
  it("resolves product IDs through shop-products extract", () => {
    const products = {
      "23791": {
        itemId: 23791,
        stack: 1,
        isCp: true,
        name: "Jailer Tops",
      },
    }
    expect(resolveListingItemId(products, 23791)).toEqual({
      itemId: 23791,
      currency: "CP",
    })
  })

  it("falls back to raw product ID as item ID", () => {
    expect(resolveListingItemId({}, 99999)).toEqual({
      itemId: 99999,
      currency: "Macca",
    })
  })

  it("indexes shop tabs by resolved item ID", () => {
    const xml = `<objects>
      <object name="ServerShop">
        <member name="ShopID">648</member>
        <member name="Name">test Shop 648</member>
        <member name="Type">COMP_SHOP</member>
        <member name="Tabs">
          <element>
            <object name="ServerShopTab">
              <member name="Name">foo tab</member>
              <member name="Products">
                <element>
                  <object name="ServerShopProduct">
                    <member name="ProductID">23791</member>
                    <member name="BasePrice">3</member>
                  </object>
                </element>
              </member>
            </object>
          </element>
        </member>
      </object>
    </objects>`

    const byItemId = buildCompShopSourcesIndex(
      [{ filename: "compshop-648.xml", xml }],
      {
        "23791": { itemId: 23791, stack: 1, isCp: true },
      }
    )

    expect(byItemId["23791"]).toEqual([
      {
        shopId: 648,
        shopName: "test Shop 648",
        tabName: "foo tab",
        productId: 23791,
        itemId: 23791,
        basePrice: 3,
        currency: "CP",
      },
    ])
  })
})
