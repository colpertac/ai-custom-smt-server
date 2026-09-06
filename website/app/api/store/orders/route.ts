import { apiFail, apiOk } from "@/lib/api-response"
import { loadWikiItemsPayload } from "@/lib/wiki-catalog-load"
import { listStoreOrdersForUser } from "@/lib/store-prices-store"
import { requireWebSession } from "@/lib/web-session"

export async function GET() {
  const session = await requireWebSession()
  if (!session) {
    return apiFail("Unauthorized", 401, "UNAUTHORIZED")
  }

  const orders = listStoreOrdersForUser(session.username, 20)
  const items = loadWikiItemsPayload().data.items
  const nameById = new Map(items.map((i) => [i.id, i.name]))
  const iconById = new Map(items.map((i) => [i.id, i.iconSrc ?? null]))

  return apiOk({
    orders: orders.map((order) => {
      const counts = new Map<number, number>()
      for (const id of order.itemIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
      const lines = [...counts.entries()].map(([itemId, qty]) => ({
        itemId,
        qty,
        name: nameById.get(itemId) ?? `Item #${itemId}`,
        iconSrc: iconById.get(itemId) ?? null,
      }))
      return {
        clientOrderId: order.clientOrderId,
        cpCharged: order.cpCharged,
        createdAt: order.createdAt,
        lines,
      }
    }),
  })
}
