/** Boss-crate loot + optional CP trade (config-driven, no manual XML). */

export const REPORT_REWARD_SCHEMA_VERSION = 1 as const

/** Fixed NPC package sizes (CP). Cost = itemsPerCp × package. */
export const LINEAR_CP_PACKAGES = [1, 5, 10, 50, 100] as const

/**
 * Stock client dialog choice strings for report trade (jackfrost /
 * event_reporttrade). Key = item cost shown on the button; value = messageID.
 * Choices whose cost is missing here will not render a correct label in-game.
 */
export const STOCK_REPORT_COST_MESSAGE_IDS: Readonly<Record<number, number>> = {
  10: 130711,
  50: 130712,
  100: 130713,
  500: 130714,
  1000: 130715,
  5000: 130716,
  10000: 130717,
  50000: 130718,
  100000: 2000203,
}

/** Stock "Cancel" choice (no `next`, closes dialog). */
export const STOCK_REPORT_TRADE_CANCEL_MESSAGE_ID = 606

/** Custom CEventMessage IDs for non-stock package costs (docs/ids.md). */
export const CUSTOM_CHOICE_MESSAGE_ID_MIN = 9_180_000
export const CUSTOM_CHOICE_MESSAGE_ID_MAX = 9_180_999

export type ChoiceMessagesStore = {
  /** Item cost (string key) → CEventMessage ID in the custom range. */
  byCost: Record<string, number>
}

export type CustomEventMessage = {
  id: number
  lines: string[]
}

export type BossCrateDrop = {
  itemId: number
  /** Admin note, e.g. "Machete" or "Dungeon report". */
  label?: string
  minStack: number
  maxStack: number
  /** Drop chance 1–100 (100 = always). Maps to DropSet Rate. */
  rate: number
  /** When set, players trade this item at the CP exchange NPC. */
  tradableForCp?: boolean
}

export type ReportTradeTier = {
  /** Reports consumed per exchange. */
  cost: number
  /** CP granted. */
  cp: number
  /** Stock dialog choice message id (optional). */
  choiceMessageId?: number
}

export type ReportTraderNpc = {
  label: string
  dynamicMapId: number
  npcId: number
  x: number
  y: number
  rotation: number
}

export type ReportRewardGlobal = {
  reportItemId: number
  reportItemLabel?: string
  /** Event id prefix, e.g. AI_REPORT_TRADE → AI_REPORT_TRADE_GREET */
  eventPrefix: string
  greetMessageId: number
  promptMessageId: number
  endMessageId: number
  /** Items traded for exactly 1 CP (linear; packages are multiples). */
  itemsPerCp: number
  /**
   * NPC dialog packages as CP amounts (linear: items = itemsPerCp × cp).
   * Defaults to LINEAR_CP_PACKAGES when omitted.
   */
  cpPackages: number[]
  traders: ReportTraderNpc[]
  /** @deprecated Migrated to itemsPerCp on read. */
  tradeTiers?: ReportTradeTier[]
}

export type ReportRewardGlobalFile = {
  version: typeof REPORT_REWARD_SCHEMA_VERSION
  global: ReportRewardGlobal
}

export type ReportRewardDungeon = {
  id: string
  name: string
  family?: string
  difficulty?: string
  enabled: boolean
  /** Internal stock boss-crate target — auto-filled from catalog. */
  appendDropSetId: number
  /** Items added to the normal boss crate on clear. */
  drops: BossCrateDrop[]
  /** @deprecated Legacy single-item fields — migrated to `drops` on read. */
  minStack?: number
  maxStack?: number
  rate?: number
  notes?: string
}

export type ReportRewardDungeonFile = {
  version: typeof REPORT_REWARD_SCHEMA_VERSION
  dungeon: ReportRewardDungeon
}

export type ReportRewardListItem = {
  id: string
  name: string
  family?: string
  difficulty?: string
  enabled: boolean
  appendDropSetId: number
  dropCount: number
  filename: string
  /** @deprecated */
  minStack?: number
  maxStack?: number
  rate?: number
}

export function normalizeCpPackages(
  packages: number[] | undefined
): number[] {
  const cleaned = [...new Set(
    (packages?.length ? packages : [...LINEAR_CP_PACKAGES])
      .map((n) => Math.floor(Number(n)))
      .filter((n) => Number.isFinite(n) && n >= 1)
  )].sort((a, b) => a - b)
  return cleaned.length ? cleaned : [...LINEAR_CP_PACKAGES]
}

export function stockChoiceMessageIdForCost(cost: number): number | undefined {
  return STOCK_REPORT_COST_MESSAGE_IDS[cost]
}

export function nextCustomChoiceMessageId(
  store: ChoiceMessagesStore
): number {
  const used = new Set(Object.values(store.byCost))
  for (
    let id = CUSTOM_CHOICE_MESSAGE_ID_MIN;
    id <= CUSTOM_CHOICE_MESSAGE_ID_MAX;
    id++
  ) {
    if (!used.has(id)) return id
  }
  throw new Error(
    `CEventMessage custom range exhausted (${CUSTOM_CHOICE_MESSAGE_ID_MIN}–${CUSTOM_CHOICE_MESSAGE_ID_MAX})`
  )
}

/**
 * Resolve dialog message IDs for every package (stock or allocated custom).
 * Mutates/returns an updated choice-messages store when new costs are seen.
 */
export function resolveTradeTiersWithMessages(
  itemsPerCp: number,
  packages: number[] | undefined,
  store: ChoiceMessagesStore
): {
  tiers: ReportTradeTier[]
  store: ChoiceMessagesStore
  customMessages: CustomEventMessage[]
  allocated: boolean
} {
  const byCost: Record<string, number> = { ...store.byCost }
  let allocated = false
  const customMessages: CustomEventMessage[] = []
  const rate = Math.max(1, Math.floor(itemsPerCp))

  const tiers = normalizeCpPackages(packages).map((cp) => {
    const cost = rate * cp
    const stock = stockChoiceMessageIdForCost(cost)
    if (stock != null) {
      return { cost, cp, choiceMessageId: stock }
    }
    const key = String(cost)
    let id = byCost[key]
    if (id == null) {
      id = nextCustomChoiceMessageId({ byCost })
      byCost[key] = id
      allocated = true
    }
    customMessages.push({ id, lines: [String(cost)] })
    return { cost, cp, choiceMessageId: id }
  })

  // Dedupe custom messages by id (same cost once).
  const seen = new Set<number>()
  const uniqueCustom = customMessages.filter((m) => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })

  return {
    tiers,
    store: { byCost },
    customMessages: uniqueCustom,
    allocated,
  }
}

export function linearTradeTiers(
  itemsPerCp: number,
  packages?: number[],
  customByCost?: Record<string, number> | Record<number, number>
): ReportTradeTier[] {
  const store: ChoiceMessagesStore = { byCost: {} }
  if (customByCost) {
    for (const [k, v] of Object.entries(customByCost)) {
      store.byCost[String(k)] = Number(v)
    }
  }
  return resolveTradeTiersWithMessages(itemsPerCp, packages, store).tiers
}

/** Packages whose item cost has no stock dialog string (need client patch). */
export function tradeTiersMissingStockLabels(
  itemsPerCp: number,
  packages?: number[]
): ReportTradeTier[] {
  const rate = Math.max(1, Math.floor(itemsPerCp))
  return normalizeCpPackages(packages)
    .map((cp) => ({ cost: rate * cp, cp }))
    .filter((t) => stockChoiceMessageIdForCost(t.cost) == null)
}

/** Infer items-per-CP from legacy tier list (prefers a 1-CP row). */
export function itemsPerCpFromTradeTiers(
  tiers: ReportTradeTier[] | undefined
): number {
  if (!tiers?.length) return 10
  const one = tiers.find((t) => t.cp === 1 && t.cost >= 1)
  if (one) return one.cost
  const first = tiers[0]!
  return Math.max(1, Math.round(first.cost / Math.max(1, first.cp)))
}
