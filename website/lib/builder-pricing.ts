import { priceWikiItems } from "@/lib/store-price-resolve"
import {
  mapPlannerSlotToGrant,
  type BuilderGrantFields,
} from "@/lib/builder-grant-map"
import type { PlannerSlot } from "@/lib/gear-planner-combat"

/** Flat CP added once per fused piece (any S2/SItem donor ≠ S1). */
export const BUILDER_FUSE_PREMIUM_CP = 75

/** Flat CP added per tarot or soul enchant on a piece. */
export const BUILDER_ENCHANT_PREMIUM_CP = 40

export const BUILDER_MAX_PIECES = 15
export const BUILDER_MAX_TOTAL_CP = 100_000

export type BuilderPriceLine = {
  slotLabel: string
  s1ItemId: number
  productId: number
  donorCp: number
  fusePremium: number
  enchantPremium: number
  cp: number
  fused: boolean
  tarot: number
  soul: number
  name: string
}

export type BuilderPriceQuote =
  | {
      ok: true
      totalCp: number
      lines: BuilderPriceLine[]
      grants: BuilderGrantFields[]
      warnings: string[]
      customGrants: BuilderGrantFields[]
      stockProductIds: number[]
    }
  | {
      ok: false
      error: string
      code: string
      warnings?: string[]
      lines?: BuilderPriceLine[]
    }

/**
 * Price a builder loadout: per equipped slot, Σ that piece's donor wiki
 * prices + fuse/enchant premiums.
 */
export function priceBuilderLoadout(loadout: PlannerSlot[]): BuilderPriceQuote {
  const equipped = loadout.filter((s) => s.s1ItemId != null)
  if (equipped.length === 0) {
    return {
      ok: false,
      error: "Loadout has no equipped pieces",
      code: "EMPTY_LOADOUT",
    }
  }
  if (equipped.length > BUILDER_MAX_PIECES) {
    return {
      ok: false,
      error: `At most ${BUILDER_MAX_PIECES} pieces per checkout`,
      code: "TOO_MANY_PIECES",
    }
  }

  const warnings: string[] = []
  const mappedSlots: {
    slot: PlannerSlot
    grant: BuilderGrantFields
    donorItemIds: number[]
    fused: boolean
    hasEnchant: boolean
  }[] = []

  for (const slot of equipped) {
    const mapped = mapPlannerSlotToGrant(slot)
    if (!mapped.ok) {
      return {
        ok: false,
        error: mapped.error,
        code: mapped.code,
        warnings: [...warnings, ...(mapped.warnings ?? [])],
      }
    }
    warnings.push(...mapped.warnings)
    mappedSlots.push({
      slot,
      grant: mapped.grant,
      donorItemIds: mapped.donorItemIds,
      fused: mapped.fused,
      hasEnchant: mapped.hasEnchant,
    })
  }

  const allDonorIds = [
    ...new Set(mappedSlots.flatMap((m) => m.donorItemIds)),
  ]
  const priced = priceWikiItems(allDonorIds)
  const byId = new Map(priced.map((p) => [p.itemId, p]))

  for (const id of allDonorIds) {
    const view = byId.get(id)
    if (!view?.sellable || !view.product) {
      return {
        ok: false,
        error: view?.reason || `Item #${id} is not sellable`,
        code: "NOT_SELLABLE",
        warnings,
      }
    }
  }

  const lines: BuilderPriceLine[] = []
  const grants: BuilderGrantFields[] = []
  const customGrants: BuilderGrantFields[] = []
  const stockProductIds: number[] = []
  let totalCp = 0

  for (const m of mappedSlots) {
    let donorCp = 0
    for (const id of m.donorItemIds) {
      donorCp += byId.get(id)!.cp
    }
    const enchantCount =
      (m.grant.tarot > 0 ? 1 : 0) + (m.grant.soul > 0 ? 1 : 0)
    const fusePremium = m.fused ? BUILDER_FUSE_PREMIUM_CP : 0
    const enchantPremium = enchantCount * BUILDER_ENCHANT_PREMIUM_CP
    const cp = donorCp + fusePremium + enchantPremium
    totalCp += cp

    const s1View = byId.get(m.grant.s1ItemId)
    lines.push({
      slotLabel: m.slot.label,
      s1ItemId: m.grant.s1ItemId,
      productId: m.grant.productId,
      donorCp,
      fusePremium,
      enchantPremium,
      cp,
      fused: m.fused,
      tarot: m.grant.tarot,
      soul: m.grant.soul,
      name: s1View?.name ?? `#${m.grant.s1ItemId}`,
    })

    grants.push(m.grant)
    const isCustom =
      m.grant.basicEffect !== 0 ||
      m.grant.specialEffect !== 0 ||
      m.grant.tarot !== 0 ||
      m.grant.soul !== 0
    if (isCustom) {
      customGrants.push(m.grant)
    } else {
      stockProductIds.push(m.grant.productId)
    }
  }

  if (totalCp > BUILDER_MAX_TOTAL_CP) {
    return {
      ok: false,
      error: `Order exceeds max CP (${BUILDER_MAX_TOTAL_CP})`,
      code: "CP_CAP",
      warnings,
      lines,
    }
  }

  return {
    ok: true,
    totalCp,
    lines,
    grants,
    warnings,
    customGrants,
    stockProductIds,
  }
}
