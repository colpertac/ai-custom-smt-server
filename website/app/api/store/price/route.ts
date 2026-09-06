import { apiFail, apiOk } from "@/lib/api-response"
import { loadWikiItemsPayload } from "@/lib/wiki-catalog-load"
import { priceWikiItems } from "@/lib/store-price-resolve"

export async function GET(request: Request) {
  const idsParam = new URL(request.url).searchParams.get("ids") ?? ""
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
  const unique = [...new Set(ids)].slice(0, 50)
  if (unique.length === 0) {
    return apiFail(
      "Provide ids query (comma-separated item ids)",
      400,
      "VALIDATION"
    )
  }

  try {
    const iconById = new Map(
      loadWikiItemsPayload().data.items.map((i) => [i.id, i.iconSrc ?? null])
    )
    const prices = priceWikiItems(unique).map((p) => ({
      itemId: p.itemId,
      name: p.name,
      cp: p.cp,
      source: p.source,
      sellable: p.sellable,
      reason: p.reason,
      productId: p.product?.productId ?? null,
      iconSrc: iconById.get(p.itemId) ?? null,
    }))
    return apiOk({ prices })
  } catch (err) {
    return apiFail(
      err instanceof Error ? err.message : "Price lookup failed",
      500,
      "PRICE_ERROR"
    )
  }
}
