import { apiFail, apiOk } from "@/lib/api-response"
import { isAdminLevel } from "@/lib/admin-level"
import {
  loadShopProducts,
  resolveShopProduct,
  type ShopProductInfo,
} from "@/lib/shop-products"
import { requireWebSession } from "@/lib/web-session"

export type ShopProductLookupRow = {
  productId: number
  preview: ShopProductInfo | null
}

/** Resolve ShopProductData IDs against shop-products.json for admin UI previews. */
export async function GET(request: Request) {
  const gate = await requireWebSession()
  if (!gate) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(gate.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const url = new URL(request.url)
  const raw = url.searchParams.get("ids") ?? ""
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 64)

  const extract = loadShopProducts()
  const products = extract?.products ?? null
  const rows: ShopProductLookupRow[] = ids.map((productId) => ({
    productId,
    preview: resolveShopProduct(products, productId),
  }))

  return apiOk({
    productExtractPresent: extract != null,
    products: rows,
  })
}
