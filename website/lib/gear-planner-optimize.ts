import { type WikiItem } from "@/content/wiki"
import { EQUIP_SLOTS, type EquipSlotKey } from "@/lib/armory-equipment"
import {
  applyEnchantToSlot,
  applyLayerToSlot,
  canApplyEnchant,
  canApplyLayer,
  computeGearPlannerCombat,
  emptyPlannerLoadout,
  equipWikiItemOntoSlot,
  PLANNER_STATS,
  rankEnchantsForStat,
  rankItemsForStat,
  type EnchantSide,
  type GearLayer,
  type GearPlannerResult,
  type PlannerAttrs,
  type PlannerLnc,
  type PlannerSlot,
  type PlannerStatKey,
} from "@/lib/gear-planner-combat"

/** Hard-cap planner stats the optimizer must satisfy first. */
export const HARD_CAP_STATS = [
  "lbc",
  "tac",
  "pc",
  "pp",
  "incant",
  "cooldown",
] as const satisfies readonly PlannerStatKey[]

export type HardCapStat = (typeof HARD_CAP_STATS)[number]

/** Soft-priority pool shown in the drag-and-drop modal (order = preference). */
export const OPTIMIZE_PRIORITY_STATS: readonly PlannerStatKey[] = [
  "lbc",
  "lbp",
  "tac",
  "tap",
  "pc",
  "pp",
  "fcc",
  "critical",
  "lbCap",
  "cooldown",
  "incant",
]

/** Default order matching common DPS focus (user: LBC/LBP/TAC/TAP/PC/PP/FCC/Crit). */
export const DEFAULT_OPTIMIZE_PRIORITIES: PlannerStatKey[] = [
  "lbc",
  "lbp",
  "tac",
  "tap",
  "pc",
  "pp",
  "fcc",
  "critical",
]

/** @deprecated Prefer `priorities` — kept for call-site compat. */
export type OptimizeSoftWeights = {
  critical: number
  lbp: number
  lbCap: number
}

export const DEFAULT_SOFT_WEIGHTS: OptimizeSoftWeights = {
  critical: 1,
  lbp: 1,
  lbCap: 0.5,
}

export type OptimizeBudget = "quick" | "normal"

export type OptimizeOptions = {
  loadout: PlannerSlot[]
  attrs: PlannerAttrs
  lnc: PlannerLnc
  gender: 0 | 1
  /** Ordered soft goals (index 0 = highest priority). */
  priorities?: PlannerStatKey[]
  /** @deprecated Use `priorities`. */
  weights?: OptimizeSoftWeights
  /** When true, never change S1 / appearance bases. */
  lockS1?: boolean
  budget?: OptimizeBudget
  /** Soft wall-clock limit in ms (overrides budget preset). */
  timeBudgetMs?: number
  signal?: { cancelled: boolean }
  onProgress?: (progress: OptimizeProgress) => void
}

export type OptimizeProgress = {
  phase: "seed" | "beam" | "local" | "done"
  evaluations: number
  elapsedMs: number
  bestHardDeficit: number
  bestSoft: number
}

export type OptimizeChangeLayer =
  | GearLayer
  | EnchantSide
  | "whole"

export type OptimizeChange = {
  slot: EquipSlotKey
  layer: OptimizeChangeLayer
  fromId: number | null
  toId: number | null
  note: string
}

export type OptimizeScoreSnapshot = {
  hardDeficit: number
  deficits: Record<HardCapStat, number>
  soft: number
  atCap: Record<HardCapStat, boolean>
}

export type OptimizeResult = {
  loadout: PlannerSlot[]
  before: OptimizeScoreSnapshot
  after: OptimizeScoreSnapshot
  changes: OptimizeChange[]
  evaluations: number
  elapsedMs: number
  cancelled: boolean
}

export type LoadoutFitness = {
  hardDeficit: number
  deficits: Record<HardCapStat, number>
  soft: number
  atCap: Record<HardCapStat, boolean>
}

const LB_CAP_BASE = 30000

const SLOT_SEARCH_ORDER: EquipSlotKey[] = [
  "weapon",
  "top",
  "bottom",
  "head",
  "feet",
  "arms",
  "extra",
  "back",
  "ring",
  "earring",
  "neck",
  "face",
  "talisman",
  "comp",
  "bullets",
]

const BUDGET_MS: Record<OptimizeBudget, number> = {
  quick: 2000,
  normal: 4000,
}

const BEAM_WIDTH = 12
const S1_CANDIDATES = 6
const LAYER_CANDIDATES = 5
const ENCHANT_CANDIDATES = 5
const DIVERSITY_S1_OVERLAP = 0.8
const YIELD_EVERY = 8

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setTimeout !== "undefined") {
      setTimeout(resolve, 0)
    } else {
      resolve()
    }
  })
}

export function cloneLoadout(loadout: PlannerSlot[]): PlannerSlot[] {
  return loadout.map((slot) => ({ ...slot }))
}

export function hardDeficitForStat(
  key: HardCapStat,
  raw: number
): number {
  switch (key) {
    case "lbc":
    case "tac":
    case "pc":
    case "pp":
      return Math.max(0, 100 - raw)
    case "incant":
      return Math.max(0, raw)
    case "cooldown":
      return Math.max(0, raw - 5)
  }
}

export function softScoreFromResult(
  result: GearPlannerResult,
  priorities: readonly PlannerStatKey[] = DEFAULT_OPTIMIZE_PRIORITIES
): number {
  let soft = 0
  const n = priorities.length
  priorities.forEach((key, index) => {
    const weight = n - index
    const def = PLANNER_STATS.find((s) => s.key === key)
    const raw = result.byStat[key]?.raw ?? 0
    if (!def) return
    if (def.kind === "reduction") {
      // Lower raw is better (more reduction) → invert around 100.
      soft += weight * (100 - raw)
    } else if (def.kind === "lbCap") {
      soft += weight * (raw - LB_CAP_BASE)
    } else {
      soft += weight * raw
    }
  })
  return soft
}

/** Map legacy Crit/LBP/LB Cap sliders into a priority list. */
export function prioritiesFromWeights(
  weights: OptimizeSoftWeights
): PlannerStatKey[] {
  const ranked: Array<{ key: PlannerStatKey; w: number }> = [
    { key: "critical", w: weights.critical },
    { key: "lbp", w: weights.lbp },
    { key: "lbCap", w: weights.lbCap },
  ]
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w || a.key.localeCompare(b.key))
  const keys = ranked.map((r) => r.key)
  for (const fallback of DEFAULT_OPTIMIZE_PRIORITIES) {
    if (!keys.includes(fallback)) keys.push(fallback)
  }
  return keys
}

function resolvePriorities(options: {
  priorities?: PlannerStatKey[]
  weights?: OptimizeSoftWeights
}): PlannerStatKey[] {
  if (options.priorities && options.priorities.length > 0) {
    return options.priorities.filter((k) =>
      OPTIMIZE_PRIORITY_STATS.includes(k)
    )
  }
  if (options.weights) return prioritiesFromWeights(options.weights)
  return [...DEFAULT_OPTIMIZE_PRIORITIES]
}

/** Pure fitness from a combat result (hard deficit primary, soft secondary). */
export function scoreLoadout(
  result: GearPlannerResult,
  priorities: readonly PlannerStatKey[] = DEFAULT_OPTIMIZE_PRIORITIES
): LoadoutFitness {
  const deficits = {} as Record<HardCapStat, number>
  const atCap = {} as Record<HardCapStat, boolean>
  let hardDeficit = 0
  for (const key of HARD_CAP_STATS) {
    const raw = result.byStat[key]?.raw ?? 0
    const d = hardDeficitForStat(key, raw)
    deficits[key] = d
    atCap[key] = d === 0
    hardDeficit += d
  }
  return {
    hardDeficit,
    deficits,
    soft: softScoreFromResult(result, priorities),
    atCap,
  }
}

/** Lower hardDeficit wins; on tie, higher soft wins. */
export function compareFitness(a: LoadoutFitness, b: LoadoutFitness): number {
  if (a.hardDeficit !== b.hardDeficit) return a.hardDeficit - b.hardDeficit
  return b.soft - a.soft
}

export function isBetterFitness(a: LoadoutFitness, b: LoadoutFitness): boolean {
  return compareFitness(a, b) < 0
}

export function worstHardStat(fitness: LoadoutFitness): HardCapStat | null {
  let best: HardCapStat | null = null
  let bestDeficit = 0
  for (const key of HARD_CAP_STATS) {
    const d = fitness.deficits[key]
    if (d > bestDeficit) {
      bestDeficit = d
      best = key
    }
  }
  return best
}

function softPrimaryStat(priorities: readonly PlannerStatKey[]): PlannerStatKey {
  return priorities[0] ?? "critical"
}

export function targetStatForSearch(
  fitness: LoadoutFitness,
  priorities: readonly PlannerStatKey[]
): PlannerStatKey {
  return worstHardStat(fitness) ?? softPrimaryStat(priorities)
}

/** Stats to try for candidates: worst hard gaps, then soft priorities. */
export function candidateStatOrder(
  fitness: LoadoutFitness,
  priorities: readonly PlannerStatKey[]
): PlannerStatKey[] {
  const out: PlannerStatKey[] = []
  const push = (k: PlannerStatKey | null | undefined) => {
    if (!k || out.includes(k)) return
    out.push(k)
  }
  const hardRanked = [...HARD_CAP_STATS].sort(
    (a, b) => fitness.deficits[b] - fitness.deficits[a]
  )
  for (const k of hardRanked) {
    if (fitness.deficits[k] > 0) push(k)
    if (out.length >= 3) break
  }
  for (const k of priorities) {
    push(k)
    if (out.length >= 6) break
  }
  if (out.length === 0) push(softPrimaryStat(priorities))
  return out
}

/** Compact S1 fingerprint for diversity pruning. */
export function s1Fingerprint(loadout: PlannerSlot[]): string {
  return SLOT_SEARCH_ORDER.map((key) => {
    const slot = loadout.find((s) => s.slot === key)
    return `${key}:${slot?.s1ItemId ?? "-"}`
  }).join("|")
}

export function s1IdSet(loadout: PlannerSlot[]): Set<number> {
  const ids = new Set<number>()
  for (const slot of loadout) {
    if (slot.s1ItemId != null) ids.add(slot.s1ItemId)
  }
  return ids
}

/** Jaccard overlap of equipped S1 ids (0–1). */
export function s1Overlap(a: PlannerSlot[], b: PlannerSlot[]): number {
  const sa = s1IdSet(a)
  const sb = s1IdSet(b)
  if (sa.size === 0 && sb.size === 0) return 1
  let inter = 0
  for (const id of sa) if (sb.has(id)) inter++
  const union = sa.size + sb.size - inter
  return union === 0 ? 1 : inter / union
}

type ScoredBeam = {
  loadout: PlannerSlot[]
  fitness: LoadoutFitness
  fingerprint: string
}

/**
 * Keep top-K beams by fitness while preferring diverse S1 fingerprints.
 * Near-duplicates (≥80% S1 overlap) are dropped when a better peer already kept.
 */
export function pruneBeamDiverse(
  beams: Array<{
    loadout: PlannerSlot[]
    fitness: LoadoutFitness
    fingerprint: string
  }>,
  width: number,
  overlapThreshold = DIVERSITY_S1_OVERLAP
): ScoredBeam[] {
  const sorted = [...beams].sort((a, b) =>
    compareFitness(a.fitness, b.fitness)
  )
  const kept: ScoredBeam[] = []
  for (const beam of sorted) {
    if (kept.length >= width) break
    const tooSimilar = kept.some(
      (k) => s1Overlap(k.loadout, beam.loadout) >= overlapThreshold
    )
    if (tooSimilar && kept.length > 0) {
      // Allow if clearly better hard deficit than the similar peer's worst.
      const similar = kept.find(
        (k) => s1Overlap(k.loadout, beam.loadout) >= overlapThreshold
      )
      if (
        similar &&
        beam.fitness.hardDeficit < similar.fitness.hardDeficit - 1
      ) {
        // Replace the worse similar peer.
        const idx = kept.indexOf(similar)
        kept[idx] = beam
        kept.sort((a, b) => compareFitness(a.fitness, b.fitness))
      }
      continue
    }
    kept.push(beam)
  }
  // If diversity emptied the beam, fall back to pure top-K.
  if (kept.length === 0) {
    return sorted.slice(0, width)
  }
  return kept.slice(0, width)
}

function slotOf(loadout: PlannerSlot[], key: EquipSlotKey): PlannerSlot {
  return loadout.find((s) => s.slot === key)!
}

function uniqueItems(items: WikiItem[]): WikiItem[] {
  const seen = new Set<number>()
  const out: WikiItem[] = []
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }
  return out
}

/**
 * Memoize rank lists for one optimize run. Whole-piece ranks use an empty
 * loadout so set-completion is approximate — piece contrib dominates ranking.
 */
export class CandidateCache {
  private itemCache = new Map<string, WikiItem[]>()
  private enchantCache = new Map<string, number[]>()

  constructor(
    private gender: 0 | 1,
    private attrs: PlannerAttrs,
    private lnc: PlannerLnc
  ) {}

  items(
    slot: EquipSlotKey,
    layer: GearLayer | null,
    stat: PlannerStatKey,
    limit: number
  ): WikiItem[] {
    const key = `${stat}|${slot}|${layer ?? "whole"}|${limit}`
    const hit = this.itemCache.get(key)
    if (hit) return hit
    const ranked = rankItemsForStat({
      stat,
      slot,
      layer,
      gender: this.gender,
      loadout: emptyPlannerLoadout(),
      limit,
    }).map((h) => h.item)
    this.itemCache.set(key, ranked)
    return ranked
  }

  enchants(side: EnchantSide, stat: PlannerStatKey, limit: number): number[] {
    const key = `${stat}|${side}|${limit}`
    const hit = this.enchantCache.get(key)
    if (hit) return hit
    const ranked = rankEnchantsForStat({
      side,
      stat,
      attrs: this.attrs,
      lnc: this.lnc,
      limit,
    }).map((h) => h.enchant.id)
    this.enchantCache.set(key, ranked)
    return ranked
  }

  mixedS1(
    slot: EquipSlotKey,
    stats: PlannerStatKey[],
    perStat: number
  ): WikiItem[] {
    const items: WikiItem[] = []
    for (const stat of stats) {
      items.push(...this.items(slot, null, stat, perStat))
    }
    return uniqueItems(items).slice(0, S1_CANDIDATES)
  }
}

export function candidateItemsForSlot(options: {
  slot: EquipSlotKey
  layer: GearLayer | null
  stat: PlannerStatKey
  gender: 0 | 1
  loadout: PlannerSlot[]
  limit: number
  cache?: CandidateCache
}): WikiItem[] {
  if (options.cache) {
    return options.cache.items(
      options.slot,
      options.layer,
      options.stat,
      options.limit
    )
  }
  const hits = rankItemsForStat({
    stat: options.stat,
    slot: options.slot,
    layer: options.layer,
    gender: options.gender,
    loadout: options.loadout,
    limit: options.limit,
  })
  return hits.map((h) => h.item)
}

export function candidateEnchantsForSide(options: {
  side: EnchantSide
  stat: PlannerStatKey
  attrs: PlannerAttrs
  lnc: PlannerLnc
  limit: number
  cache?: CandidateCache
}): number[] {
  if (options.cache) {
    return options.cache.enchants(options.side, options.stat, options.limit)
  }
  return rankEnchantsForStat({
    side: options.side,
    stat: options.stat,
    attrs: options.attrs,
    lnc: options.lnc,
    limit: options.limit,
  }).map((h) => h.enchant.id)
}

function mixedS1Candidates(options: {
  slot: EquipSlotKey
  gender: 0 | 1
  loadout: PlannerSlot[]
  stats: PlannerStatKey[]
  perStat: number
  cache?: CandidateCache
}): WikiItem[] {
  if (options.cache) {
    return options.cache.mixedS1(options.slot, options.stats, options.perStat)
  }
  const items: WikiItem[] = []
  for (const stat of options.stats) {
    items.push(
      ...candidateItemsForSlot({
        slot: options.slot,
        layer: null,
        stat,
        gender: options.gender,
        loadout: options.loadout,
        limit: options.perStat,
      })
    )
  }
  return uniqueItems(items).slice(0, S1_CANDIDATES)
}

function tryEquipWhole(
  loadout: PlannerSlot[],
  slotKey: EquipSlotKey,
  item: WikiItem,
  gender: 0 | 1
): PlannerSlot[] | null {
  const target = slotOf(loadout, slotKey)
  const check = canApplyLayer({ target, donor: item, layer: "s1", gender })
  if (!check.ok) return null
  return equipWikiItemOntoSlot(loadout, slotKey, item)
}

function tryApplyLayer(
  loadout: PlannerSlot[],
  slotKey: EquipSlotKey,
  layer: GearLayer,
  item: WikiItem,
  gender: 0 | 1
): PlannerSlot[] | null {
  const target = slotOf(loadout, slotKey)
  const check = canApplyLayer({ target, donor: item, layer, gender })
  if (!check.ok) return null
  return applyLayerToSlot(loadout, slotKey, layer, item)
}

function tryApplyEnchant(
  loadout: PlannerSlot[],
  slotKey: EquipSlotKey,
  side: EnchantSide,
  enchantId: number
): PlannerSlot[] | null {
  const target = slotOf(loadout, slotKey)
  const check = canApplyEnchant({ target, enchantId, side })
  if (!check.ok) return null
  return applyEnchantToSlot(loadout, slotKey, side, enchantId)
}

function evaluate(
  loadout: PlannerSlot[],
  attrs: PlannerAttrs,
  lnc: PlannerLnc,
  priorities: readonly PlannerStatKey[]
): { result: GearPlannerResult; fitness: LoadoutFitness } {
  const result = computeGearPlannerCombat(loadout, attrs, lnc)
  return { result, fitness: scoreLoadout(result, priorities) }
}

function itemsForLayerMultiStat(options: {
  slot: EquipSlotKey
  layer: GearLayer | null
  fitness: LoadoutFitness
  priorities: readonly PlannerStatKey[]
  gender: 0 | 1
  loadout: PlannerSlot[]
  limit: number
  cache: CandidateCache
}): WikiItem[] {
  const stats = candidateStatOrder(options.fitness, options.priorities)
  const items: WikiItem[] = []
  for (const stat of stats) {
    items.push(
      ...candidateItemsForSlot({
        slot: options.slot,
        layer: options.layer,
        stat,
        gender: options.gender,
        loadout: options.loadout,
        limit: options.limit,
        cache: options.cache,
      })
    )
    if (uniqueItems(items).length >= options.limit) break
  }
  return uniqueItems(items).slice(0, options.limit)
}

function enchantsForSideMultiStat(options: {
  side: EnchantSide
  fitness: LoadoutFitness
  priorities: readonly PlannerStatKey[]
  attrs: PlannerAttrs
  lnc: PlannerLnc
  limit: number
  cache: CandidateCache
}): number[] {
  const stats = candidateStatOrder(options.fitness, options.priorities)
  const ids: number[] = []
  const seen = new Set<number>()
  for (const stat of stats) {
    for (const id of candidateEnchantsForSide({
      side: options.side,
      stat,
      attrs: options.attrs,
      lnc: options.lnc,
      limit: options.limit,
      cache: options.cache,
    })) {
      if (seen.has(id)) continue
      seen.add(id)
      ids.push(id)
      if (ids.length >= options.limit) return ids
    }
  }
  return ids
}

function fillSlotLayers(
  loadout: PlannerSlot[],
  slotKey: EquipSlotKey,
  gender: 0 | 1,
  attrs: PlannerAttrs,
  lnc: PlannerLnc,
  priorities: readonly PlannerStatKey[],
  lockS1: boolean,
  cache: CandidateCache
): PlannerSlot[] {
  let next = cloneLoadout(loadout)
  const { fitness } = evaluate(next, attrs, lnc, priorities)
  const target = slotOf(next, slotKey)

  if (!lockS1 || target.s1ItemId == null) {
    const s1s = itemsForLayerMultiStat({
      slot: slotKey,
      layer: null,
      fitness,
      priorities,
      gender,
      loadout: next,
      limit: S1_CANDIDATES,
      cache,
    })
    if (s1s[0]) {
      const equipped = tryEquipWhole(next, slotKey, s1s[0], gender)
      if (equipped) next = equipped
    }
  }

  if (slotOf(next, slotKey).s1ItemId == null) return next

  const afterBase = evaluate(next, attrs, lnc, priorities).fitness

  for (const layer of ["s2", "s3"] as const) {
    const items = itemsForLayerMultiStat({
      slot: slotKey,
      layer,
      fitness: afterBase,
      priorities,
      gender,
      loadout: next,
      limit: LAYER_CANDIDATES,
      cache,
    })
    for (const item of items) {
      const applied = tryApplyLayer(next, slotKey, layer, item, gender)
      if (applied) {
        next = applied
        break
      }
    }
  }

  for (const side of ["tarot", "soul"] as const) {
    const ids = enchantsForSideMultiStat({
      side,
      fitness: afterBase,
      priorities,
      attrs,
      lnc,
      limit: ENCHANT_CANDIDATES,
      cache,
    })
    for (const id of ids) {
      const applied = tryApplyEnchant(next, slotKey, side, id)
      if (applied) {
        next = applied
        break
      }
    }
  }

  return next
}

function buildGreedySeed(options: {
  biasStat: PlannerStatKey
  gender: 0 | 1
  attrs: PlannerAttrs
  lnc: PlannerLnc
  priorities: readonly PlannerStatKey[]
  lockS1: boolean
  base: PlannerSlot[]
  cache: CandidateCache
  shouldStop?: () => boolean
  maxSlots?: number
}): PlannerSlot[] {
  let loadout = cloneLoadout(options.base)
  const slots = SLOT_SEARCH_ORDER.slice(
    0,
    options.maxSlots ?? SLOT_SEARCH_ORDER.length
  )
  for (const slotKey of slots) {
    if (options.shouldStop?.()) break
    const target = slotOf(loadout, slotKey)
    if (options.lockS1 && target.s1ItemId != null) {
      loadout = fillSlotLayers(
        loadout,
        slotKey,
        options.gender,
        options.attrs,
        options.lnc,
        options.priorities,
        true,
        options.cache
      )
      continue
    }
    const s1s = mixedS1Candidates({
      slot: slotKey,
      gender: options.gender,
      loadout,
      stats: [
        options.biasStat,
        "cooldown",
        "lbc",
        ...options.priorities.slice(0, 3),
      ],
      perStat: 2,
      cache: options.cache,
    })
    if (s1s[0]) {
      const equipped = tryEquipWhole(loadout, slotKey, s1s[0], options.gender)
      if (equipped) loadout = equipped
    }
    loadout = fillSlotLayers(
      loadout,
      slotKey,
      options.gender,
      options.attrs,
      options.lnc,
      options.priorities,
      options.lockS1,
      options.cache
    )
  }
  return loadout
}

function expandSlot(
  beam: ScoredBeam,
  slotKey: EquipSlotKey,
  gender: 0 | 1,
  attrs: PlannerAttrs,
  lnc: PlannerLnc,
  priorities: readonly PlannerStatKey[],
  lockS1: boolean,
  cache: CandidateCache
): PlannerSlot[][] {
  const out: PlannerSlot[][] = []
  const base = beam.loadout
  const target = slotOf(base, slotKey)
  const fitness = beam.fitness

  const s1Items =
    lockS1 && target.s1ItemId != null
      ? []
      : itemsForLayerMultiStat({
          slot: slotKey,
          layer: null,
          fitness,
          priorities,
          gender,
          loadout: base,
          limit: S1_CANDIDATES,
          cache,
        })

  out.push(cloneLoadout(base))

  if (lockS1 && target.s1ItemId != null) {
    for (const layer of ["s2", "s3"] as const) {
      const items = itemsForLayerMultiStat({
        slot: slotKey,
        layer,
        fitness,
        priorities,
        gender,
        loadout: base,
        limit: LAYER_CANDIDATES,
        cache,
      })
      for (const item of items.slice(0, 2)) {
        const applied = tryApplyLayer(base, slotKey, layer, item, gender)
        if (applied) out.push(applied)
      }
    }
    for (const side of ["tarot", "soul"] as const) {
      const ids = enchantsForSideMultiStat({
        side,
        fitness,
        priorities,
        attrs,
        lnc,
        limit: ENCHANT_CANDIDATES,
        cache,
      })
      for (const id of ids.slice(0, 2)) {
        const applied = tryApplyEnchant(base, slotKey, side, id)
        if (applied) out.push(applied)
      }
    }
    return out
  }

  for (const s1 of s1Items.slice(0, S1_CANDIDATES)) {
    let next = tryEquipWhole(base, slotKey, s1, gender)
    if (!next) continue
    out.push(cloneLoadout(next))

    for (const layer of ["s2", "s3"] as const) {
      const items = itemsForLayerMultiStat({
        slot: slotKey,
        layer,
        fitness,
        priorities,
        gender,
        loadout: next,
        limit: 3,
        cache,
      })
      for (const item of items) {
        const applied = tryApplyLayer(next, slotKey, layer, item, gender)
        if (applied) {
          next = applied
          out.push(cloneLoadout(next))
          break
        }
      }
    }

    for (const side of ["tarot", "soul"] as const) {
      const ids = enchantsForSideMultiStat({
        side,
        fitness,
        priorities,
        attrs,
        lnc,
        limit: 3,
        cache,
      })
      for (const id of ids) {
        const applied = tryApplyEnchant(next, slotKey, side, id)
        if (applied) {
          next = applied
          out.push(cloneLoadout(next))
          break
        }
      }
    }
  }

  return out
}

function randomNeighbor(
  loadout: PlannerSlot[],
  gender: 0 | 1,
  attrs: PlannerAttrs,
  lnc: PlannerLnc,
  priorities: readonly PlannerStatKey[],
  lockS1: boolean,
  rng: () => number,
  cache: CandidateCache,
  fitness: LoadoutFitness
): PlannerSlot[] | null {
  const occupied = loadout.filter((s) => s.s1ItemId != null)
  const slots =
    occupied.length > 0
      ? occupied
      : loadout.filter((s) => SLOT_SEARCH_ORDER.includes(s.slot))
  if (slots.length === 0) return null

  const slot = slots[Math.floor(rng() * slots.length)]!
  const slotKey = slot.slot
  const roll = rng()

  if (!lockS1 && roll < 0.25) {
    const items = itemsForLayerMultiStat({
      slot: slotKey,
      layer: null,
      fitness,
      priorities,
      gender,
      loadout,
      limit: S1_CANDIDATES,
      cache,
    })
    if (items.length === 0) return null
    const item = items[Math.floor(rng() * items.length)]!
    return tryEquipWhole(loadout, slotKey, item, gender)
  }

  if (slot.s1ItemId == null) {
    const items = itemsForLayerMultiStat({
      slot: slotKey,
      layer: null,
      fitness,
      priorities,
      gender,
      loadout,
      limit: S1_CANDIDATES,
      cache,
    })
    if (items.length === 0) return null
    return tryEquipWhole(loadout, slotKey, items[0]!, gender)
  }

  if (roll < 0.55) {
    const layer: GearLayer = rng() < 0.5 ? "s2" : "s3"
    const items = itemsForLayerMultiStat({
      slot: slotKey,
      layer,
      fitness,
      priorities,
      gender,
      loadout,
      limit: LAYER_CANDIDATES,
      cache,
    })
    if (items.length === 0) return null
    const item = items[Math.floor(rng() * items.length)]!
    return tryApplyLayer(loadout, slotKey, layer, item, gender)
  }

  const side: EnchantSide = roll < 0.78 ? "tarot" : "soul"
  const ids = enchantsForSideMultiStat({
    side,
    fitness,
    priorities,
    attrs,
    lnc,
    limit: ENCHANT_CANDIDATES,
    cache,
  })
  if (ids.length === 0) return null
  const id = ids[Math.floor(rng() * ids.length)]!
  return tryApplyEnchant(loadout, slotKey, side, id)
}

function layerId(slot: PlannerSlot, layer: OptimizeChangeLayer): number | null {
  switch (layer) {
    case "s1":
    case "whole":
      return slot.s1ItemId
    case "s2":
      return slot.s2ItemId
    case "s3":
      return slot.s3ItemId
    case "tarot":
      return slot.tarotEnchantId
    case "soul":
      return slot.soulEnchantId
  }
}

export function diffLoadouts(
  before: PlannerSlot[],
  after: PlannerSlot[]
): OptimizeChange[] {
  const changes: OptimizeChange[] = []
  for (const def of EQUIP_SLOTS) {
    const a = before.find((s) => s.slot === def.key)!
    const b = after.find((s) => s.slot === def.key)!
    const layers: OptimizeChangeLayer[] = [
      "s1",
      "s2",
      "s3",
      "tarot",
      "soul",
    ]
    for (const layer of layers) {
      const fromId = layerId(a, layer)
      const toId = layerId(b, layer)
      if (fromId === toId) continue
      const label = layer === "s1" ? "S1" : layer.toUpperCase()
      changes.push({
        slot: def.key,
        layer,
        fromId,
        toId,
        note: `${def.label} ${label}: ${fromId ?? "empty"} → ${toId ?? "empty"}`,
      })
    }
  }
  return changes
}

function snapshotFromFitness(fitness: LoadoutFitness): OptimizeScoreSnapshot {
  return {
    hardDeficit: fitness.hardDeficit,
    deficits: { ...fitness.deficits },
    soft: fitness.soft,
    atCap: { ...fitness.atCap },
  }
}

function annotateCapNotes(
  changes: OptimizeChange[],
  before: OptimizeScoreSnapshot,
  after: OptimizeScoreSnapshot
): OptimizeChange[] {
  const closed: string[] = []
  for (const key of HARD_CAP_STATS) {
    if (!before.atCap[key] && after.atCap[key]) {
      closed.push(key.toUpperCase())
    }
  }
  if (closed.length === 0 || changes.length === 0) return changes
  const suffix = ` (helped close ${closed.join(", ")})`
  return changes.map((c, i) =>
    i === 0 ? { ...c, note: c.note + suffix } : c
  )
}

/**
 * Time-budgeted beam + local-search optimizer.
 * Main-thread cooperative async (yields so the UI can paint progress).
 */
export async function optimizeGearLoadout(
  options: OptimizeOptions
): Promise<OptimizeResult> {
  const priorities = resolvePriorities(options)
  const lockS1 = Boolean(options.lockS1)
  const timeBudgetMs =
    options.timeBudgetMs ?? BUDGET_MS[options.budget ?? "normal"]
  const cache = new CandidateCache(options.gender, options.attrs, options.lnc)

  // Warm a small set of ranks before the clock so Quick budgets aren't only cold misses.
  for (const stat of ["cooldown", "lbc", softPrimaryStat(priorities)] as PlannerStatKey[]) {
    for (const slot of ["weapon", "top", "bottom", "head", "feet", "arms"] as const) {
      cache.items(slot, null, stat, S1_CANDIDATES)
    }
    cache.enchants("tarot", stat, ENCHANT_CANDIDATES)
    cache.enchants("soul", stat, ENCHANT_CANDIDATES)
  }

  const start = Date.now()
  let evaluations = 0
  const signal = options.signal

  const startLoadout = cloneLoadout(options.loadout)
  const startEval = evaluate(
    startLoadout,
    options.attrs,
    options.lnc,
    priorities
  )
  evaluations++

  let bestLoadout = cloneLoadout(startLoadout)
  let bestFitness = startEval.fitness

  const report = (phase: OptimizeProgress["phase"]) => {
    options.onProgress?.({
      phase,
      evaluations,
      elapsedMs: Date.now() - start,
      bestHardDeficit: bestFitness.hardDeficit,
      bestSoft: bestFitness.soft,
    })
  }

  const timedOut = () => Date.now() - start >= timeBudgetMs
  const cancelled = () => Boolean(signal?.cancelled)
  const shouldStop = () => cancelled() || timedOut()

  const consider = (loadout: PlannerSlot[]) => {
    const { fitness } = evaluate(
      loadout,
      options.attrs,
      options.lnc,
      priorities
    )
    evaluations++
    if (isBetterFitness(fitness, bestFitness)) {
      bestFitness = fitness
      bestLoadout = cloneLoadout(loadout)
    }
    return fitness
  }

  report("seed")
  const seeds: PlannerSlot[][] = [startLoadout]
  const seedOpts = {
    gender: options.gender,
    attrs: options.attrs,
    lnc: options.lnc,
    priorities,
    lockS1,
    cache,
    shouldStop,
  }

  // Always produce at least one improved seed from the current loadout.
  seeds.push(
    buildGreedySeed({
      ...seedOpts,
      biasStat: softPrimaryStat(priorities),
      base: cloneLoadout(startLoadout),
      maxSlots: 8,
    })
  )
  report("seed")
  await yieldToMain()

  if (!lockS1 && !shouldStop()) {
    for (const bias of ["cooldown", "lbc"] as const) {
      if (shouldStop()) break
      seeds.push(
        buildGreedySeed({
          ...seedOpts,
          biasStat: bias,
          lockS1: false,
          base: emptyPlannerLoadout(),
          maxSlots: 6,
        })
      )
      report("seed")
      await yieldToMain()
    }
  }

  let beams: ScoredBeam[] = []
  // Always score every seed we built — even if the wall clock already expired
  // during seed construction (otherwise best stays stuck on the start loadout).
  for (const seed of seeds) {
    const fitness = consider(seed)
    beams.push({
      loadout: cloneLoadout(seed),
      fitness,
      fingerprint: s1Fingerprint(seed),
    })
    report("seed")
    await yieldToMain()
  }
  beams = pruneBeamDiverse(beams, BEAM_WIDTH)

  report("beam")
  for (const slotKey of SLOT_SEARCH_ORDER) {
    if (shouldStop()) break
    const expanded: ScoredBeam[] = []
    for (const beam of beams) {
      if (shouldStop()) break
      const variants = expandSlot(
        beam,
        slotKey,
        options.gender,
        options.attrs,
        options.lnc,
        priorities,
        lockS1,
        cache
      )
      for (const variant of variants) {
        const fitness = consider(variant)
        expanded.push({
          loadout: variant,
          fitness,
          fingerprint: s1Fingerprint(variant),
        })
        if (evaluations % YIELD_EVERY === 0) {
          report("beam")
          await yieldToMain()
          if (shouldStop()) break
        }
      }
    }
    beams = pruneBeamDiverse([...beams, ...expanded], BEAM_WIDTH)
  }

  if (
    !beams.some(
      (b) => s1Fingerprint(b.loadout) === s1Fingerprint(bestLoadout)
    )
  ) {
    beams.push({
      loadout: cloneLoadout(bestLoadout),
      fitness: bestFitness,
      fingerprint: s1Fingerprint(bestLoadout),
    })
  }

  report("local")
  let cursor = cloneLoadout(bestLoadout)
  let cursorFitness = bestFitness
  let rngState = 0x9e3779b9 ^ (evaluations + startLoadout.length)
  const rng = () => {
    rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0
    return rngState / 0x100000000
  }

  while (!shouldStop()) {
    const neighbor = randomNeighbor(
      cursor,
      options.gender,
      options.attrs,
      options.lnc,
      priorities,
      lockS1,
      rng,
      cache,
      cursorFitness
    )
    if (!neighbor) {
      if (evaluations % 20 === 0) await yieldToMain()
      evaluations++
      continue
    }
    const fitness = consider(neighbor)
    if (isBetterFitness(fitness, cursorFitness)) {
      cursor = neighbor
      cursorFitness = fitness
    } else if (rng() < 0.08) {
      cursor = cloneLoadout(bestLoadout)
      cursorFitness = bestFitness
    }
    if (evaluations % YIELD_EVERY === 0) {
      report("local")
      await yieldToMain()
    }
  }

  const endEval = evaluate(
    bestLoadout,
    options.attrs,
    options.lnc,
    priorities
  )
  evaluations++

  const before = snapshotFromFitness(startEval.fitness)
  const after = snapshotFromFitness(endEval.fitness)
  const changes = annotateCapNotes(
    diffLoadouts(startLoadout, bestLoadout),
    before,
    after
  )

  report("done")

  return {
    loadout: bestLoadout,
    before,
    after,
    changes,
    evaluations,
    elapsedMs: Date.now() - start,
    cancelled: cancelled(),
  }
}
