/**
 * Phase 16D — stable dungeon payout working-copy schema.
 *
 * Editors mutate this JSON; export generates DropSet + Event XML packages
 * (Phase 13 Suginami pattern). Does not write live runtime/datastore.
 */

export type PayoutCrateDrop = {
  itemId: number
  minStack: number
  maxStack: number
  /** Drop weight / Rate (higher = more likely). */
  rate: number
  /** Optional mutex group — at most one drop per MutexID. */
  mutexId?: number | null
}

/** Direct clear grant (e.g. Magical Golden Apple), not via crate table. */
export type PayoutClearItem = {
  itemId: number
  /** Positive = grant that many. */
  quantity: number
}

export type PayoutHooks = {
  afterNormalLootEventId: string
  afterFiendLootEventId: string
  bonusEventId: string
  bonusFiendEventId: string
  /** Stock event to resume after normal-clear bonus (fiend path may omit). */
  resumeNormalNext: string
}

export type PayoutDifficulty = "bronze" | "silver" | "gold" | "special"
export type PayoutMode = "normal" | "bearcat" | "boss" | "diaspora" | "other"

export type DungeonPayout = {
  /** Stable slug / filename stem, e.g. suginami-bronze */
  id: string
  name: string
  /** Short note shown in UI */
  description?: string
  /** Dungeon family for grouping in the admin list */
  family?: string
  difficulty?: PayoutDifficulty
  mode?: PayoutMode
  /** Extra label for boss paths / sheet variants (e.g. Amaterasu ♀) */
  variantLabel?: string
  /** Free-form notes (Coral, per-floor, sheet source, TBD IDs) */
  notes?: string
  enabled: boolean
  instanceId: number
  /** ZONE_INSTANCE flag used to dedup bonus in one run */
  dedupFlag: number
  bossGroupId: number
  dropSetId: number
  spotId: number
  /** Number of boss-box spots (Phase 13 uses 5× SpotID 2). */
  crateCount: number
  /** CP granted to party members still in the instance. */
  cp: number
  crateDrops: PayoutCrateDrop[]
  clearItems: PayoutClearItem[]
  hooks: PayoutHooks
}

export const PAYOUT_SCHEMA_VERSION = 1 as const

export type DungeonPayoutFile = {
  version: typeof PAYOUT_SCHEMA_VERSION
  payout: DungeonPayout
}

export type PayoutListItem = {
  id: string
  name: string
  instanceId: number
  enabled: boolean
  cp: number
  family?: string
  difficulty?: string
  mode?: string
  variantLabel?: string
  crateDropCount: number
  clearItemCount: number
  filename: string
}
