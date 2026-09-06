import { fetcher } from "@/lib/fetcher"
import type { StorePriceFormula } from "@/lib/store-pricing"
import type { PriceBreakdown, PriceSource } from "@/lib/store-pricing"

export type AdminOverrideRow = {
  itemId: number
  cp: number
  note: string
  updatedAt: number
  name: string | null
}

export type AdminPricePreview = {
  itemId: number
  name: string
  cp: number
  source: PriceSource
  sellable: boolean
  reason?: string
  productId: number | null
  breakdown: PriceBreakdown | null
}

export const fetchStoreFormula = () =>
  fetcher<{ formula: StorePriceFormula; knownStatIds: string[] }>(
    "admin/store-prices/formula"
  )

export const saveStoreFormula = (formula: StorePriceFormula) =>
  fetcher<{ formula: StorePriceFormula; knownStatIds: string[] }>(
    "admin/store-prices/formula",
    { method: "PUT", json: formula }
  )

export const fetchStoreOverrides = () =>
  fetcher<{ overrides: AdminOverrideRow[] }>("admin/store-prices/overrides")

export const upsertStoreOverride = (payload: {
  itemId: number
  cp: number
  note?: string
}) =>
  fetcher<{ override: AdminOverrideRow }>("admin/store-prices/overrides", {
    method: "POST",
    json: payload,
  })

export const deleteStoreOverride = (itemId: number) =>
  fetcher<{ itemId: number; deleted: boolean }>(
    `admin/store-prices/overrides?itemId=${itemId}`,
    { method: "DELETE" }
  )

export const previewStorePrice = (itemId: number) =>
  fetcher<AdminPricePreview>(`admin/store-prices/preview?itemId=${itemId}`)

export const fetchStoreCartSettings = () =>
  fetcher<{ cartEnabled: boolean }>("admin/store-prices/settings")

export const saveStoreCartSettings = (cartEnabled: boolean) =>
  fetcher<{ cartEnabled: boolean }>("admin/store-prices/settings", {
    method: "PUT",
    json: { cartEnabled },
  })
