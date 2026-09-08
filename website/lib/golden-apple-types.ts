/**
 * Magical Golden Apple (item 21941) amounts from Golden Light NPC 3401.
 * Source of truth: zones/partial/npcs/NPC3401.xml — zone flag 340102.
 */

export const GOLDEN_APPLE_ITEM_ID = 21941
export const GOLDEN_APPLE_AMOUNT_FLAG = 340102
export const GOLDEN_LIGHT_NPC_ID = 3401

export type GoldenApplePartial = {
  /** ServerZonePartial ID, e.g. 340104 */
  partialId: number
  dynamicMapIds: number[]
  /** Quantity written to flag 340102 (apples granted). */
  apples: number
}

export type GoldenApplePayoutLink = {
  payoutId: string
  apples: number | null
  partialId: number | null
  dynamicMapIds: number[]
  /** Other payout ids that share this NPC3401 partial (same amount). */
  sharedWith: string[]
}

/**
 * Match DynamicMapID → instance id (e.g. 5401004 → 5401).
 * Prefer longer numeric prefixes that appear in `instanceIds`.
 */
export function instanceIdsForDynamicMap(
  dynamicMapId: number,
  knownInstanceIds: ReadonlySet<number>
): number[] {
  const s = String(dynamicMapId)
  const hits: number[] = []
  for (const inst of knownInstanceIds) {
    const prefix = String(inst)
    if (s.startsWith(prefix) && s.length > prefix.length) {
      hits.push(inst)
    }
  }
  hits.sort((a, b) => String(b).length - String(a).length)
  return hits
}

export function linkPayoutsToApplePartials(
  payouts: { id: string; instanceId: number; instanceIds?: number[] }[],
  partials: GoldenApplePartial[]
): GoldenApplePayoutLink[] {
  const known = new Set<number>()
  for (const p of payouts) {
    for (const id of p.instanceIds?.length ? p.instanceIds : [p.instanceId]) {
      known.add(id)
    }
  }

  /** instanceId → partial */
  const byInstance = new Map<number, GoldenApplePartial>()
  for (const partial of partials) {
    for (const mapId of partial.dynamicMapIds) {
      const hits = instanceIdsForDynamicMap(mapId, known)
      const bestInst = hits[0]
      if (bestInst == null) continue
      if (!byInstance.has(bestInst)) {
        byInstance.set(bestInst, partial)
      }
    }
  }

  const partialToPayouts = new Map<number, string[]>()
  const links: GoldenApplePayoutLink[] = []

  for (const p of payouts) {
    const ids = p.instanceIds?.length ? p.instanceIds : [p.instanceId]
    let best: GoldenApplePartial | null = null
    let bestLen = -1
    for (const inst of ids) {
      const partial = byInstance.get(inst)
      if (!partial) continue
      const len = String(inst).length
      if (len > bestLen) {
        best = partial
        bestLen = len
      }
    }
    if (best) {
      const list = partialToPayouts.get(best.partialId) ?? []
      list.push(p.id)
      partialToPayouts.set(best.partialId, list)
    }
    links.push({
      payoutId: p.id,
      apples: best?.apples ?? null,
      partialId: best?.partialId ?? null,
      dynamicMapIds: best?.dynamicMapIds ?? [],
      sharedWith: [],
    })
  }

  for (const link of links) {
    if (link.partialId == null) continue
    const group = partialToPayouts.get(link.partialId) ?? []
    link.sharedWith = group.filter((id) => id !== link.payoutId)
  }

  return links
}
