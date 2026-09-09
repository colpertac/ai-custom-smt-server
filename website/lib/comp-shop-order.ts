/**
 * Slot remapping for COMP shop reorder: list-position IDs stay put; shop
 * content moves into those IDs (and filenames). Pure — safe for client + server.
 */

/** old content ShopID → ShopID after landing in a new row slot */
export function planShopSlotRemap(
  slotIds: number[],
  contentOrderIds: number[]
): Map<number, number> {
  if (slotIds.length !== contentOrderIds.length) {
    throw new Error("slotIds and contentOrderIds length mismatch")
  }
  const map = new Map<number, number>()
  for (let i = 0; i < contentOrderIds.length; i++) {
    map.set(contentOrderIds[i]!, slotIds[i]!)
  }
  return map
}

export function applyShopSlotRemapToList<
  T extends { shopId: number; filename: string },
>(shopsInCurrentOrder: T[], contentOrderIds: number[]): T[] {
  const slotIds = shopsInCurrentOrder.map((s) => s.shopId)
  const byId = new Map(shopsInCurrentOrder.map((s) => [s.shopId, s] as const))
  const remap = planShopSlotRemap(slotIds, contentOrderIds)
  return contentOrderIds.map((fromId, i) => {
    const shop = byId.get(fromId)
    if (!shop) {
      throw new Error(`Unknown shop id ${fromId}`)
    }
    const toId = remap.get(fromId) ?? slotIds[i]!
    return {
      ...shop,
      shopId: toId,
      filename: `compshop-${toId}.xml`,
    }
  })
}
