import { notifyLaneAPendingChanged } from "@/features/admin/lane-a-pending"
import { fetcher, type ApiErrorBody } from "@/lib/fetcher"
import { api } from "@/lib/kyClient"
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

export const createAdminShop = async (payload: {
  shopId: number
  name: string
}) => {
  const result = await fetcher<{ shopId: number; filename: string }>(
    "admin/shops",
    {
      method: "POST",
      json: payload,
    }
  )
  notifyLaneAPendingChanged()
  return result
}

export const saveAdminShop = async (shopId: number, body: CompShop) => {
  const result = await fetcher<{ shopId: number; filename: string }>(
    `admin/shops/${shopId}`,
    {
      method: "PUT",
      json: body,
    }
  )
  notifyLaneAPendingChanged()
  return result
}

export const deleteAdminShop = async (shopId: number) => {
  const result = await fetcher<{ shopId: number }>(`admin/shops/${shopId}`, {
    method: "DELETE",
  })
  notifyLaneAPendingChanged()
  return result
}

async function downloadBlob(path: string, filename: string): Promise<void> {
  const response = await api(path)
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const errorData = (await response.json()) as Partial<ApiErrorBody>
      if (typeof errorData?.message === "string" && errorData.message) {
        message = errorData.message
      }
    } catch {
      /* keep defaults */
    }
    throw new Error(message)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Fetch via XHR so App Router does not soft-navigate the `<a href>`. */
export function downloadAdminShopXml(shopId: number): Promise<void> {
  return downloadBlob(
    `admin/shops/${shopId}/export`,
    `Shop${shopId}.xml`
  )
}

export function downloadAdminShopsZipAll(): Promise<void> {
  return downloadBlob("admin/shops/export-all", "comp_shops.zip")
}
