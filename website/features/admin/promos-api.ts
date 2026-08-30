import { fetcher } from "@/lib/fetcher"
import type { PromoLimitType } from "@/lib/comp-api"
import type { ShopProductInfo } from "@/lib/shop-products"

export type AdminPromoItem = {
  productId: number
  preview: ShopProductInfo | null
}

export type AdminPromoRow = {
  code: string
  startTime: number
  endTime: number
  useLimit: number
  limitType: PromoLimitType
  items: AdminPromoItem[]
}

export type AdminPromosPayload = {
  promos: AdminPromoRow[]
  productExtractPresent: boolean
}

export type CreatePromoPayload = {
  code: string
  startTime: number
  endTime: number
  useLimit: number
  limitType: PromoLimitType
  items: number[]
}

export const fetchAdminPromos = () =>
  fetcher<AdminPromosPayload>("admin/promos")

export const createAdminPromo = (payload: CreatePromoPayload) =>
  fetcher<
    AdminPromosPayload & {
      created: AdminPromoRow[]
      duplicateWarning: boolean
    }
  >("admin/promos", { method: "POST", json: payload })

export const deleteAdminPromo = (code: string) =>
  fetcher<{ code: string; message: string }>(
    `admin/promos/${encodeURIComponent(code)}`,
    { method: "DELETE" }
  )

export const lookupShopProducts = (ids: number[]) => {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))]
  if (unique.length === 0) {
    return Promise.resolve({
      productExtractPresent: true,
      products: [] as AdminPromoItem[],
    })
  }
  return fetcher<{
    productExtractPresent: boolean
    products: AdminPromoItem[]
  }>(`admin/shop-products?ids=${unique.join(",")}`)
}
