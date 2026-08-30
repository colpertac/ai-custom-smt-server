import { fetcher } from "@/lib/fetcher"
import type { ShopProductInfo } from "@/lib/shop-products"
import type { CompShop, CompShopProduct, CompShopTab } from "@/lib/comp-shop-xml"

export type ShopListItem = {
  shopId: number
  name: string
  type: string
  tabCount: number
  productCount: number
  filename: string
}

export type ShopProductRow = CompShopProduct & {
  preview: ShopProductInfo | null
}

export type ShopTabRow = Omit<CompShopTab, "products"> & {
  products: ShopProductRow[]
}

export type ShopDetail = Omit<CompShop, "tabs"> & {
  tabs: ShopTabRow[]
  productExtractPresent: boolean
}

export const fetchAdminShops = () => fetcher<ShopListItem[]>("admin/shops")

export const fetchAdminShop = (shopId: number) =>
  fetcher<ShopDetail>(`admin/shops/${shopId}`)

export const createAdminShop = (payload: { shopId: number; name: string }) =>
  fetcher<{ shopId: number; filename: string }>("admin/shops", {
    method: "POST",
    json: payload,
  })

export const saveAdminShop = (shopId: number, body: CompShop) =>
  fetcher<{ shopId: number; filename: string }>(`admin/shops/${shopId}`, {
    method: "PUT",
    json: body,
  })

export const deleteAdminShop = (shopId: number) =>
  fetcher<{ shopId: number }>(`admin/shops/${shopId}`, {
    method: "DELETE",
  })

export function adminShopExportUrl(shopId: number): string {
  return `/api/admin/shops/${shopId}/export`
}

export function adminShopsExportAllUrl(): string {
  return `/api/admin/shops/export-all`
}
