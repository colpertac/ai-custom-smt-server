import type { PlannerSlot } from "@/lib/gear-planner-combat"
import { resolveProductForItem } from "@/lib/store-product-map"

export type BuilderGrantFields = {
  productId: number
  /** ShopProduct / S1 appearance item id (for display + audit). */
  s1ItemId: number
  basicEffect: number
  specialEffect: number
  tarot: number
  soul: number
}

export type BuilderSlotMapResult =
  | {
      ok: true
      grant: BuilderGrantFields
      warnings: string[]
      /** Item ids whose wiki store prices contribute to the CP total. */
      donorItemIds: number[]
      fused: boolean
      hasEnchant: boolean
    }
  | {
      ok: false
      error: string
      code: string
      warnings?: string[]
    }

/**
 * Map a planner slot to PostItem grant fields.
 *
 * - Type/product = ShopProduct for S1
 * - BasicEffect = s2 (or s1); if s3 ≠ s2, keep s2 and warn (S2/S3 collapse)
 * - SpecialEffect = sitem (or s1)
 * - Tarot / Soul as stored
 *
 * Effect fields equal to S1 are stored as 0 (vanilla semantics) unless an
 * enchant or true fuse is present — then donors are written explicitly so the
 * lobby custom-grant path accepts the row.
 */
export function mapPlannerSlotToGrant(slot: PlannerSlot): BuilderSlotMapResult {
  const warnings: string[] = []
  if (slot.s1ItemId == null || slot.s1ItemId <= 0) {
    return {
      ok: false,
      error: `${slot.label}: empty slot`,
      code: "EMPTY_SLOT",
    }
  }

  const s1 = slot.s1ItemId
  const s2 = slot.s2ItemId ?? s1
  const sitem = slot.sitemItemId ?? s1
  const tarot = slot.tarotEnchantId ?? 0
  const soul = slot.soulEnchantId ?? 0

  if (slot.s3ItemId != null && slot.s3ItemId !== s2) {
    warnings.push(
      `${slot.label}: S3 (#${slot.s3ItemId}) differs from S2 (#${s2}); Post stores S2 only (game BasicEffect collapse).`
    )
  }

  const product = resolveProductForItem(s1)
  if (!product) {
    return {
      ok: false,
      error: `${slot.label}: no ShopProduct for item #${s1}`,
      code: "NO_PRODUCT",
      warnings,
    }
  }

  // S3 collapses into S2 for Post; fuse premium only when S2/SItem differ.
  const fused = s2 !== s1 || sitem !== s1
  const hasEnchant = tarot > 0 || soul > 0

  // Always write non-zero effect donors when fused/enchanted so grant_custom
  // accepts the row; otherwise leave 0 for stock-equivalent pieces.
  let basicEffect = 0
  let specialEffect = 0
  if (fused || hasEnchant) {
    basicEffect = s2
    specialEffect = sitem
  }

  const donorItemIds = new Set<number>([s1])
  if (s2 !== s1) donorItemIds.add(s2)
  if (sitem !== s1) donorItemIds.add(sitem)
  // s3 collapsed into s2 — do not charge separately when it differs.

  return {
    ok: true,
    grant: {
      productId: product.productId,
      s1ItemId: s1,
      basicEffect,
      specialEffect,
      tarot: tarot > 0 ? tarot : 0,
      soul: soul > 0 ? soul : 0,
    },
    warnings,
    donorItemIds: [...donorItemIds],
    fused,
    hasEnchant,
  }
}

export function mapLoadoutToGrants(loadout: PlannerSlot[]): {
  grants: BuilderGrantFields[]
  warnings: string[]
  donorItemIds: number[]
  fuseCount: number
  enchantCount: number
  error?: { message: string; code: string }
} {
  const grants: BuilderGrantFields[] = []
  const warnings: string[] = []
  const donors = new Set<number>()
  let fuseCount = 0
  let enchantCount = 0

  for (const slot of loadout) {
    if (slot.s1ItemId == null) continue
    const mapped = mapPlannerSlotToGrant(slot)
    if (!mapped.ok) {
      return {
        grants: [],
        warnings,
        donorItemIds: [],
        fuseCount: 0,
        enchantCount: 0,
        error: { message: mapped.error, code: mapped.code },
      }
    }
    if (mapped.warnings.length) warnings.push(...mapped.warnings)
    for (const id of mapped.donorItemIds) donors.add(id)
    if (mapped.fused) fuseCount += 1
    if (mapped.grant.tarot) enchantCount += 1
    if (mapped.grant.soul) enchantCount += 1

    // Stock-only pieces (no fuse/enchant) still grant via product id with
    // zero custom fields — checkout routes those through post_items.
    grants.push(mapped.grant)
  }

  if (grants.length === 0) {
    return {
      grants: [],
      warnings,
      donorItemIds: [],
      fuseCount: 0,
      enchantCount: 0,
      error: { message: "Loadout has no equipped pieces", code: "EMPTY_LOADOUT" },
    }
  }

  return {
    grants,
    warnings,
    donorItemIds: [...donors],
    fuseCount,
    enchantCount,
  }
}
