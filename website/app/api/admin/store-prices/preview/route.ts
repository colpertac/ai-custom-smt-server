import { isAdminLevel } from "@/lib/admin-level"
import { apiFail, apiOk } from "@/lib/api-response"
import { loadWikiItemsPayload } from "@/lib/wiki-catalog-load"
import { priceWikiItem } from "@/lib/store-price-resolve"
import { requireWebSession } from "@/lib/web-session"

export async function GET(request: Request) {
  const session = await requireWebSession()
  if (!session) return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  if (!isAdminLevel(session.userLevel)) {
    return apiFail("Forbidden", 403, "FORBIDDEN")
  }

  const itemId = Number(new URL(request.url).searchParams.get("itemId"))
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return apiFail("itemId query required", 400, "VALIDATION")
  }

  const item = loadWikiItemsPayload().data.items.find((i) => i.id === itemId)
  if (!item) return apiFail("Unknown wiki item", 404, "NOT_FOUND")

  const priced = priceWikiItem(item)
  return apiOk({
    itemId: item.id,
    name: item.name,
    cp: priced.cp,
    source: priced.source,
    sellable: priced.sellable,
    reason: priced.reason,
    productId: priced.product?.productId ?? null,
    breakdown: priced.breakdown,
  })
}
