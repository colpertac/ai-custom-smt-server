import { fetcher } from "@/lib/fetcher"

export type StorePriceRow = {
  itemId: number
  name: string
  cp: number
  source: "formula" | "override"
  sellable: boolean
  reason?: string
  productId: number | null
  iconSrc?: string | null
}

export type CheckoutResult = {
  replay: boolean
  cpCharged: number
  cpRemaining: number | null
  productCount: number
  itemIds: number[]
}

export type StoreOrderLine = {
  itemId: number
  qty: number
  name: string
  iconSrc: string | null
}

export type StoreOrderSummary = {
  clientOrderId: string
  cpCharged: number
  createdAt: number
  lines: StoreOrderLine[]
}

export type RelatedStoreItem = {
  itemId: number
  name: string
  iconSrc: string | null
  equipSlot: string
  category: string
  cp: number
  sellable: boolean
  reason?: string
}

export function fetchStorePrices(ids: number[]) {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))]
  if (unique.length === 0) {
    return Promise.resolve({ prices: [] as StorePriceRow[] })
  }
  return fetcher<{ prices: StorePriceRow[] }>(
    `store/price?ids=${unique.join(",")}`
  )
}

export function checkoutCart(payload: {
  clientOrderId: string
  lines: { itemId: number; qty: number }[]
}) {
  return fetcher<CheckoutResult>("store/checkout", {
    method: "POST",
    json: payload,
  })
}

export function fetchStoreOrders() {
  return fetcher<{ orders: StoreOrderSummary[] }>("store/orders")
}

export function fetchRelatedStoreItems(ids: number[]) {
  const unique = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))]
  if (unique.length === 0) {
    return Promise.resolve({ related: [] as RelatedStoreItem[] })
  }
  return fetcher<{ related: RelatedStoreItem[] }>(
    `store/related?ids=${unique.join(",")}`
  )
}
