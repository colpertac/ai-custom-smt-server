import equipmentSetsPayload from "@/content/armory/equipment-sets.json"
import itemSubcategoriesPayload from "@/content/armory/item-subcategories.json"
import sitemTokuseiPayload from "@/content/armory/sitem-tokusei.json"
import tokuseiCorrectionsPayload from "@/content/armory/tokusei-corrections.json"
import {
  getWikiEnchant,
  getWikiItem,
  isActiveEnchantId,
  listWikiEnchants,
  listWikiItems,
  wikiBasicFeatures,
  wikiCharacteristics,
  wikiSetBonus,
  type WikiEnchantCharastic,
  type WikiEnchantRecord,
  type WikiItem,
} from "@/content/wiki"
import { EQUIP_SLOTS, type EquipSlotKey } from "@/lib/armory-equipment"
import {
  evaluateEnchantCondition,
  lncPointsFromAlignment,
  type PlannerLnc,
} from "@/lib/enchant-conditions"

export type PlannerStatKey =
  | "critical"
  | "fcc"
  | "lbc"
  | "lbp"
  | "lbCap"
  | "tac"
  | "tap"
  | "pc"
  | "pp"
  | "incant"
  | "cooldown"

export type GearLayer = "s1" | "s2" | "s3"
export type EnchantSide = "tarot" | "soul"

export type PlannerAttrs = {
  str: number
  magic: number
  vit: number
  intel: number
  speed: number
  luck: number
  level: number
}

export const DEFAULT_PLANNER_ATTRS: PlannerAttrs = {
  str: 0,
  magic: 0,
  vit: 0,
  intel: 0,
  speed: 0,
  luck: 0,
  level: 1,
}

export type StatAdjustment = { id: string; type: number; value: number }

export type PlannerSlot = {
  slot: EquipSlotKey
  label: string
  index: number
  /** Appearance + SItem (S1). */
  s1ItemId: number | null
  /** basicFeatures (S2). */
  s2ItemId: number | null
  /** characteristics (S3). */
  s3ItemId: number | null
  tarotEnchantId: number | null
  soulEnchantId: number | null
}

export type LayerFive = {
  s1: number
  s2: number
  s3: number
  tarot: number
  soul: number
}

export type LayerPresence = {
  s1: boolean
  s2: boolean
  s3: boolean
  tarot: boolean
  soul: boolean
}

export type PlannerStatDef = {
  key: PlannerStatKey
  abbr: string
  label: string
  correctTblId?: string
  aspectId?: string
  baseTotal?: number
  kind: "flat" | "percent" | "reduction" | "lbCap"
}

export const PLANNER_STATS: readonly PlannerStatDef[] = [
  { key: "critical", abbr: "Crit", label: "Critical", correctTblId: "CRITICAL", kind: "flat" },
  {
    key: "fcc",
    abbr: "FCC",
    label: "Final crit chance",
    correctTblId: "FINAL_CRIT_CHANCE",
    kind: "percent",
  },
  {
    key: "lbc",
    abbr: "LBC",
    label: "Limit break chance",
    correctTblId: "LB_CHANCE",
    kind: "percent",
  },
  {
    key: "lbp",
    abbr: "LBP",
    label: "Limit break power",
    correctTblId: "LB_DAMAGE",
    kind: "percent",
  },
  {
    key: "lbCap",
    abbr: "LB Cap",
    label: "Limit break cap",
    aspectId: "LIMIT_BREAK_MAX",
    baseTotal: 30000,
    kind: "lbCap",
  },
  {
    key: "tac",
    abbr: "TAC",
    label: "Technical attack chance",
    aspectId: "TECH_ATTACK_RATE",
    kind: "percent",
  },
  {
    key: "tap",
    abbr: "TAP",
    label: "Technical attack power",
    aspectId: "TECH_ATTACK_POWER",
    kind: "percent",
  },
  {
    key: "pc",
    abbr: "PC",
    label: "Pursuit chance",
    aspectId: "PURSUIT_RATE",
    kind: "percent",
  },
  {
    key: "pp",
    abbr: "PP",
    label: "Pursuit power",
    aspectId: "PURSUIT_POWER",
    kind: "percent",
  },
  {
    key: "incant",
    abbr: "Incant",
    label: "Incantation (chant time)",
    correctTblId: "CHANT_TIME",
    kind: "reduction",
  },
  {
    key: "cooldown",
    abbr: "CD",
    label: "Cooldown time",
    correctTblId: "COOLDOWN_TIME",
    kind: "reduction",
  },
] as const

export type EquipmentSetInfo = {
  id: number
  equipment: number[]
  tokuseiIds: number[]
}

export type SetStatus = {
  id: number
  equipment: number[]
  tokuseiIds: number[]
  requiredCount: number
  matchedCount: number
  complete: boolean
  requiredSlots: number[]
}

export type PlannerStatBreakdown = {
  bySlotLayers: Record<EquipSlotKey, LayerFive>
  /** All layers per slot (piece only, no set). */
  bySlot: Record<EquipSlotKey, number>
  setBonus: number
  attrBonus: number
  gearTotal: number
  raw: number
  atCap: boolean
}

export type GearPlannerResult = {
  byStat: Record<PlannerStatKey, PlannerStatBreakdown>
  layerPresence: Record<EquipSlotKey, LayerPresence>
  activeSets: SetStatus[]
  partialSets: SetStatus[]
  /** Slot key → shared color index for set header highlighting (-1 = none). */
  setColorIndexBySlot: Record<EquipSlotKey, number>
}

/** Serializable planner payload (localStorage v3 + account builds). */
export type PlannerStoredState = {
  version: 3
  slots: Array<{
    s1: number | null
    s2: number | null
    s3: number | null
    tarot: number | null
    soul: number | null
  }>
  attrs: PlannerAttrs
  gender: 0 | 1
  lnc: PlannerLnc
  notes: string
}

type TokuseiRow = StatAdjustment

const tokuseiCorrections = (
  tokuseiCorrectionsPayload as {
    tokusei: Record<string, TokuseiRow[]>
  }
).tokusei

const sitemTokusei = (
  sitemTokuseiPayload as { items: Record<string, number[]> }
).items

const equipmentSets = (
  equipmentSetsPayload as {
    sets: Record<string, { equipment: number[]; tokuseiIds: number[] }>
  }
).sets

const itemSubcategories = (
  itemSubcategoriesPayload as { items: Record<string, number> }
).items

const FORCE_NUMERIC = new Set(["COOLDOWN_TIME", "CHANT_TIME"])
const LB_CAP_BASE = 30000

const setsByItemId = new Map<number, number[]>()
const setList: EquipmentSetInfo[] = []

for (const [idStr, set] of Object.entries(equipmentSets)) {
  const id = Number(idStr)
  const info: EquipmentSetInfo = {
    id,
    equipment: set.equipment,
    tokuseiIds: set.tokuseiIds,
  }
  setList.push(info)
  for (const itemId of set.equipment) {
    if (itemId <= 0) continue
    const list = setsByItemId.get(itemId) ?? []
    list.push(id)
    setsByItemId.set(itemId, list)
  }
}

const setsById = new Map(setList.map((s) => [s.id, s]))

export function itemSubcategory(itemId: number): number | null {
  const v = itemSubcategories[String(itemId)]
  return v == null ? null : v
}

export function emptyPlannerLoadout(): PlannerSlot[] {
  return EQUIP_SLOTS.map((slot) => ({
    slot: slot.key,
    label: slot.label,
    index: slot.index,
    s1ItemId: null,
    s2ItemId: null,
    s3ItemId: null,
    tarotEnchantId: null,
    soulEnchantId: null,
  }))
}

export function serializePlannerState(options: {
  loadout: PlannerSlot[]
  attrs: PlannerAttrs
  gender: 0 | 1
  lnc: PlannerLnc
  notes: string
}): PlannerStoredState {
  return {
    version: 3,
    slots: EQUIP_SLOTS.map((def) => {
      const slot = options.loadout.find((s) => s.index === def.index)!
      return {
        s1: slot.s1ItemId,
        s2: slot.s2ItemId,
        s3: slot.s3ItemId,
        tarot: slot.tarotEnchantId,
        soul: slot.soulEnchantId,
      }
    }),
    attrs: { ...options.attrs },
    gender: options.gender,
    lnc: options.lnc,
    notes: options.notes,
  }
}

export function parsePlannerState(raw: unknown): {
  loadout: PlannerSlot[]
  attrs: PlannerAttrs
  gender: 0 | 1
  lnc: PlannerLnc
  notes: string
} {
  const empty = emptyPlannerLoadout()
  const fallback = {
    loadout: empty,
    attrs: { ...DEFAULT_PLANNER_ATTRS },
    gender: 0 as const,
    lnc: 1 as PlannerLnc,
    notes: "",
  }
  if (!raw || typeof raw !== "object") return fallback
  const parsed = raw as Record<string, unknown>
  const slotsRaw = parsed.slots
  if (!Array.isArray(slotsRaw)) return fallback

  const loadout = empty.map((slot, i) => {
    const row = slotsRaw[i] as Record<string, unknown> | undefined
    if (!row) return slot
    const num = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : null
    return {
      ...slot,
      s1ItemId: num(row.s1),
      s2ItemId: num(row.s2),
      s3ItemId: num(row.s3),
      tarotEnchantId: num(row.tarot),
      soulEnchantId: num(row.soul),
    }
  })

  const attrsIn = (parsed.attrs ?? {}) as Partial<PlannerAttrs>
  const attrs: PlannerAttrs = {
    str: Number(attrsIn.str) || 0,
    magic: Number(attrsIn.magic) || 0,
    vit: Number(attrsIn.vit) || 0,
    intel: Number(attrsIn.intel) || 0,
    speed: Number(attrsIn.speed) || 0,
    luck: Number(attrsIn.luck) || 0,
    level: Number(attrsIn.level) || 1,
  }

  const lncRaw = parsed.lnc
  const lnc: PlannerLnc =
    lncRaw === 0 || lncRaw === 2 ? lncRaw : 1

  return {
    loadout,
    attrs,
    gender: parsed.gender === 1 ? 1 : 0,
    lnc,
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
  }
}

export function plannerSlotDisplay(slot: PlannerSlot): {
  name: string | null
  iconSrc: string | null
  level: number | null
  itemType: number | null
} {
  if (slot.s1ItemId == null) {
    return { name: null, iconSrc: null, level: null, itemType: null }
  }
  const item = getWikiItem(slot.s1ItemId)
  return {
    name: item?.name ?? `#${slot.s1ItemId}`,
    iconSrc: item?.iconSrc ?? null,
    level: item?.level ?? null,
    itemType: slot.s1ItemId,
  }
}

export function equipWikiItemOntoSlot(
  loadout: PlannerSlot[],
  slotKey: EquipSlotKey,
  item: WikiItem | null
): PlannerSlot[] {
  return loadout.map((slot) => {
    if (slot.slot !== slotKey) return slot
    if (!item) {
      return {
        ...slot,
        s1ItemId: null,
        s2ItemId: null,
        s3ItemId: null,
        tarotEnchantId: null,
        soulEnchantId: null,
      }
    }
    return {
      ...slot,
      s1ItemId: item.id,
      s2ItemId: item.id,
      s3ItemId: item.id,
      tarotEnchantId: null,
      soulEnchantId: null,
    }
  })
}

export function applyLayerToSlot(
  loadout: PlannerSlot[],
  slotKey: EquipSlotKey,
  layer: GearLayer,
  item: WikiItem
): PlannerSlot[] {
  return loadout.map((slot) => {
    if (slot.slot !== slotKey) return slot
    if (layer === "s1") {
      // New base: if slot was empty, seed all layers; else only replace S1 look/SItem.
      if (slot.s1ItemId == null) {
        return {
          ...slot,
          s1ItemId: item.id,
          s2ItemId: item.id,
          s3ItemId: item.id,
          tarotEnchantId: null,
          soulEnchantId: null,
        }
      }
      return { ...slot, s1ItemId: item.id }
    }
    if (layer === "s2") return { ...slot, s2ItemId: item.id }
    return { ...slot, s3ItemId: item.id }
  })
}

export function wikiSlotLabelForKey(key: EquipSlotKey): string {
  const found = EQUIP_SLOTS.find((s) => s.key === key)
  return found?.label ?? key
}

export function equipSlotKeyFromWikiSlot(
  equipSlot: string
): EquipSlotKey | null {
  const lower = equipSlot.toLowerCase()
  const found = EQUIP_SLOTS.find((s) => s.label.toLowerCase() === lower)
  return found?.key ?? null
}

function normalizeAdjustment(row: TokuseiRow): TokuseiRow {
  let type = row.type
  if (type >= 100 && type < 200 && type !== 101) type = type - 100
  if (type === 1 && FORCE_NUMERIC.has(row.id)) type = 0
  return { id: row.id, type, value: row.value }
}

function emptySlotMap(): Record<EquipSlotKey, number> {
  const out = {} as Record<EquipSlotKey, number>
  for (const slot of EQUIP_SLOTS) out[slot.key] = 0
  return out
}

function emptyLayerMap(): Record<EquipSlotKey, LayerFive> {
  const out = {} as Record<EquipSlotKey, LayerFive>
  for (const slot of EQUIP_SLOTS) {
    out[slot.key] = { s1: 0, s2: 0, s3: 0, tarot: 0, soul: 0 }
  }
  return out
}

function emptyPresenceMap(): Record<EquipSlotKey, LayerPresence> {
  const out = {} as Record<EquipSlotKey, LayerPresence>
  for (const slot of EQUIP_SLOTS) {
    out[slot.key] = {
      s1: false,
      s2: false,
      s3: false,
      tarot: false,
      soul: false,
    }
  }
  return out
}

function emptyBreakdown(): PlannerStatBreakdown {
  return {
    bySlotLayers: emptyLayerMap(),
    bySlot: emptySlotMap(),
    setBonus: 0,
    attrBonus: 0,
    gearTotal: 0,
    raw: 0,
    atCap: false,
  }
}

export function contribFromAdjustments(
  rows: readonly TokuseiRow[],
  def: PlannerStatDef
): number {
  let sum = 0
  for (const raw of rows) {
    const row = normalizeAdjustment(raw)
    if (def.correctTblId && row.id === def.correctTblId && row.type !== 101) {
      sum += row.value
      continue
    }
    if (def.aspectId && row.id === def.aspectId && row.type === 101) {
      sum += row.value
    }
  }
  return sum
}

function tokuseiRows(tokuseiId: number): TokuseiRow[] {
  return tokuseiCorrections[String(tokuseiId)] ?? []
}

function s1Adjustments(itemId: number): TokuseiRow[] {
  const out: TokuseiRow[] = []
  for (const tokId of sitemTokusei[String(itemId)] ?? []) {
    out.push(...tokuseiRows(tokId))
  }
  return out
}

function s2Adjustments(item: WikiItem): TokuseiRow[] {
  return wikiBasicFeatures(item).map((row) => ({
    id: row.id,
    type: row.type,
    value: row.value,
  }))
}

function s3Adjustments(item: WikiItem): TokuseiRow[] {
  return wikiCharacteristics(item).map((row) => ({
    id: row.id,
    type: row.type,
    value: row.value,
  }))
}

export function layerHasContent(item: WikiItem, layer: GearLayer): boolean {
  if (layer === "s1") {
    return (
      wikiSetBonus(item).length > 0 ||
      (sitemTokusei[String(item.id)]?.length ?? 0) > 0
    )
  }
  if (layer === "s2") return wikiBasicFeatures(item).length > 0
  return wikiCharacteristics(item).length > 0
}

function enchantSideHasContent(side: WikiEnchantCharastic): boolean {
  return (
    (side.tokuseiIds?.length ?? 0) > 0 ||
    (side.conditions?.length ?? 0) > 0 ||
    side.lines.some((l) => l.trim().length > 0) ||
    side.name.trim().length > 0
  )
}

function enchantConditionCtx(attrs: PlannerAttrs, lnc: PlannerLnc) {
  return {
    level: attrs.level,
    lnc: lncPointsFromAlignment(lnc),
    stats: {
      STR: attrs.str,
      MAGIC: attrs.magic,
      VIT: attrs.vit,
      INT: attrs.intel,
      SPEED: attrs.speed,
      LUCK: attrs.luck,
    },
  }
}

/** Tokusei rows from an enchant side, including currently-met conditions. */
export function enchantSideAdjustments(
  side: WikiEnchantCharastic,
  attrs: PlannerAttrs,
  lnc: PlannerLnc
): TokuseiRow[] {
  const out: TokuseiRow[] = []
  for (const tokId of side.tokuseiIds ?? []) {
    out.push(...tokuseiRows(tokId))
  }
  const ctx = enchantConditionCtx(attrs, lnc)
  for (const condition of side.conditions ?? []) {
    if (!evaluateEnchantCondition(condition, ctx)) continue
    for (const tokId of condition.tokuseiIds) {
      out.push(...tokuseiRows(tokId))
    }
  }
  return out
}

export function applyEnchantToSlot(
  loadout: PlannerSlot[],
  slotKey: EquipSlotKey,
  side: EnchantSide,
  enchantId: number | null
): PlannerSlot[] {
  return loadout.map((slot) => {
    if (slot.slot !== slotKey) return slot
    if (side === "tarot") return { ...slot, tarotEnchantId: enchantId }
    return { ...slot, soulEnchantId: enchantId }
  })
}

export function canApplyEnchant(options: {
  target: PlannerSlot
  enchantId: number
  side: EnchantSide
}): { ok: boolean; reason?: string } {
  const { target, enchantId, side } = options
  if (target.s1ItemId == null) {
    return { ok: false, reason: "Equip an S1 base piece before applying T/S" }
  }
  if (!isActiveEnchantId(enchantId)) {
    return { ok: false, reason: "Invalid enchant id" }
  }
  const enchant = getWikiEnchant(enchantId)
  if (!enchant) return { ok: false, reason: "Unknown enchant" }
  const sideData = side === "tarot" ? enchant.tarot : enchant.soul
  if (!enchantSideHasContent(sideData)) {
    return { ok: false, reason: `This crystal has no ${side} effect` }
  }
  return { ok: true }
}

export function itemLayerContribution(
  item: WikiItem,
  layer: GearLayer,
  statKey: PlannerStatKey
): number {
  const def = PLANNER_STATS.find((s) => s.key === statKey)
  if (!def) return 0
  if (layer === "s1") return contribFromAdjustments(s1Adjustments(item.id), def)
  if (layer === "s2") return contribFromAdjustments(s2Adjustments(item), def)
  return contribFromAdjustments(s3Adjustments(item), def)
}

/** Whole-item contribution (all layers) — used by recommend ranking. */
export function itemPieceContribution(
  item: WikiItem,
  statKey: PlannerStatKey
): number {
  return (
    itemLayerContribution(item, "s1", statKey) +
    itemLayerContribution(item, "s2", statKey) +
    itemLayerContribution(item, "s3", statKey)
  )
}

export function setsForItem(itemId: number): EquipmentSetInfo[] {
  const ids = setsByItemId.get(itemId) ?? []
  return ids
    .map((id) => setsById.get(id))
    .filter((s): s is EquipmentSetInfo => s != null)
}

export type EquipmentSetMemberView = {
  slotIndex: number
  slotKey: EquipSlotKey
  slotLabel: string
  itemId: number
  name: string
  iconSrc: string | null
  isCurrent: boolean
}

export type EquipmentSetBonusLine = {
  id: string
  label: string
  valueText: string
}

/** Wiki-facing view of multi-piece EquipmentSetData rows that include this item. */
export type EquipmentSetMembership = {
  id: number
  members: EquipmentSetMemberView[]
  bonuses: EquipmentSetBonusLine[]
}

function humanizeAspectId(id: string): string {
  return id
    .split("_")
    .map((part) => {
      if (part.length <= 3 && part === part.toUpperCase()) return part
      return part.charAt(0) + part.slice(1).toLowerCase()
    })
    .join(" ")
}

function formatSetBonusValue(row: TokuseiRow): string {
  const id = row.id
  if (id === "SKILL_ADD") return `#${row.value}`
  if (id === "STATUS_INFLICT_ADJUST" || id === "CONSTANT_STATUS") {
    return String(row.value)
  }
  if (
    id.startsWith("RATE_") ||
    id.startsWith("BOOST_") ||
    id === "LB_CHANCE" ||
    id === "LB_DAMAGE" ||
    id === "FINAL_CRIT_CHANCE" ||
    id === "CHANT_TIME" ||
    id === "COOLDOWN_TIME"
  ) {
    return row.value > 0 ? `+${row.value}%` : `${row.value}%`
  }
  return row.value > 0 ? `+${row.value}` : String(row.value)
}

function formatSetBonusLabel(row: TokuseiRow): string {
  if (row.id === "SKILL_ADD") return "Adds skill"
  return humanizeAspectId(row.id)
}

/** Multi-piece EquipmentSet membership for a wiki item page. */
export function equipmentSetMembership(
  itemId: number
): EquipmentSetMembership[] {
  return setsForItem(itemId).map((set) => {
    const members: EquipmentSetMemberView[] = []
    for (let i = 0; i < set.equipment.length; i++) {
      const mid = set.equipment[i] ?? 0
      if (mid <= 0) continue
      const slot = EQUIP_SLOTS[i]
      if (!slot) continue
      const item = getWikiItem(mid)
      members.push({
        slotIndex: i,
        slotKey: slot.key,
        slotLabel: slot.label,
        itemId: mid,
        name: item?.name ?? `Item #${mid}`,
        iconSrc: item?.iconSrc ?? null,
        isCurrent: mid === itemId,
      })
    }

    const bonuses: EquipmentSetBonusLine[] = []
    for (const tid of set.tokuseiIds) {
      for (const row of tokuseiCorrections[String(tid)] ?? []) {
        bonuses.push({
          id: row.id,
          label: formatSetBonusLabel(row),
          valueText: formatSetBonusValue(row),
        })
      }
    }

    return { id: set.id, members, bonuses }
  })
}

function requiredSlotsOf(set: EquipmentSetInfo): number[] {
  const slots: number[] = []
  for (let i = 0; i < set.equipment.length; i++) {
    if ((set.equipment[i] ?? 0) > 0) slots.push(i)
  }
  return slots
}

export function evaluateSetStatuses(equipment: PlannerSlot[]): SetStatus[] {
  const equipped = EQUIP_SLOTS.map((slotDef) => {
    const slot = equipment.find((s) => s.index === slotDef.index)
    return slot?.s1ItemId ?? 0
  })

  const out: SetStatus[] = []
  for (const set of setList) {
    const requiredSlots = requiredSlotsOf(set)
    if (requiredSlots.length === 0) continue

    let matched = 0
    let complete = true
    for (const slotIdx of requiredSlots) {
      const req = set.equipment[slotIdx] ?? 0
      if (equipped[slotIdx] === req) matched++
      else complete = false
    }
    if (matched === 0) continue
    out.push({
      id: set.id,
      equipment: set.equipment,
      tokuseiIds: set.tokuseiIds,
      requiredCount: requiredSlots.length,
      matchedCount: matched,
      complete,
      requiredSlots,
    })
  }
  return out
}

export function activeAndPartialSets(equipment: PlannerSlot[]): {
  activeSets: SetStatus[]
  partialSets: SetStatus[]
} {
  const statuses = evaluateSetStatuses(equipment)
  return {
    activeSets: statuses.filter((s) => s.complete),
    partialSets: statuses.filter((s) => !s.complete),
  }
}

/** Assign a shared color index to slots that share an active/partial set. */
export function setColorIndexBySlot(
  equipment: PlannerSlot[],
  sets: SetStatus[]
): Record<EquipSlotKey, number> {
  const out = {} as Record<EquipSlotKey, number>
  for (const slot of EQUIP_SLOTS) out[slot.key] = -1

  const ranked = [...sets].sort(
    (a, b) =>
      Number(b.complete) - Number(a.complete) ||
      b.matchedCount - a.matchedCount ||
      a.id - b.id
  )

  let colorIdx = 0
  for (const set of ranked) {
    const color = colorIdx++
    for (const slotIdx of set.requiredSlots) {
      const def = EQUIP_SLOTS[slotIdx]
      if (!def) continue
      const slot = equipment.find((s) => s.index === slotIdx)
      if (!slot?.s1ItemId) continue
      if (set.equipment[slotIdx] !== slot.s1ItemId) continue
      if (out[def.key] === -1) out[def.key] = color
    }
  }
  return out
}

export function canApplyLayer(options: {
  target: PlannerSlot
  donor: WikiItem
  layer: GearLayer
  gender: 0 | 1
}): { ok: boolean; reason?: string } {
  const { target, donor, layer, gender } = options
  const donorSlot = equipSlotKeyFromWikiSlot(donor.equipSlot)
  if (donorSlot !== target.slot) {
    return {
      ok: false,
      reason: `Donor is ${donor.equipSlot}, target is ${target.label}`,
    }
  }

  if (donor.gender !== 2 && donor.gender !== gender) {
    return {
      ok: false,
      reason: `Item is ${donor.genderLabel}; planner is ${gender === 0 ? "male" : "female"}`,
    }
  }

  if (layer !== "s1" && target.s1ItemId == null) {
    return { ok: false, reason: "Equip an S1 base piece before swapping S2/S3" }
  }

  const baseId = target.s1ItemId
  if (baseId != null) {
    const base = getWikiItem(baseId)
    if (base) {
      const baseSub = itemSubcategory(base.id)
      const donorSub = itemSubcategory(donor.id)
      if (baseSub != null && donorSub != null && baseSub !== donorSub) {
        return {
          ok: false,
          reason: "Subcategory mismatch (e.g. different weapon family)",
        }
      }
      // Armor gender lock between base and donor (ignore any=2)
      if (target.slot !== "weapon" && target.slot !== "bullets") {
        const genders = new Set<number>()
        if (base.gender !== 2) genders.add(base.gender)
        if (donor.gender !== 2) genders.add(donor.gender)
        if (genders.size > 1) {
          return { ok: false, reason: "Gender mismatch with base piece" }
        }
      }
    }
  }

  return { ok: true }
}

function chantAttrReduction(attrs: PlannerAttrs): number {
  return Math.floor(
    2.5 * Math.floor(attrs.intel * 0.1) + 1.5 * Math.floor(attrs.speed * 0.1)
  )
}

function cooldownAttrReduction(attrs: PlannerAttrs): number {
  return Math.floor(
    2.5 * Math.floor(attrs.vit * 0.1) + 1.5 * Math.floor(attrs.speed * 0.1)
  )
}

function isAtCap(def: PlannerStatDef, raw: number): boolean {
  switch (def.key) {
    case "lbc":
    case "tac":
    case "pc":
    case "pp":
      return raw >= 100
    case "incant":
      return raw <= 0
    case "cooldown":
      return raw <= 5
    default:
      return false
  }
}

export function computeGearPlannerCombat(
  equipment: PlannerSlot[],
  attrs: PlannerAttrs = DEFAULT_PLANNER_ATTRS,
  lnc: PlannerLnc = 1
): GearPlannerResult {
  const byStat = {} as Record<PlannerStatKey, PlannerStatBreakdown>
  for (const def of PLANNER_STATS) {
    byStat[def.key] = emptyBreakdown()
  }
  const layerPresence = emptyPresenceMap()

  for (const slot of equipment) {
    const s1 = slot.s1ItemId != null ? getWikiItem(slot.s1ItemId) : null
    const s2 = slot.s2ItemId != null ? getWikiItem(slot.s2ItemId) : null
    const s3 = slot.s3ItemId != null ? getWikiItem(slot.s3ItemId) : null
    const tarot =
      slot.tarotEnchantId != null && isActiveEnchantId(slot.tarotEnchantId)
        ? getWikiEnchant(slot.tarotEnchantId)
        : null
    const soul =
      slot.soulEnchantId != null && isActiveEnchantId(slot.soulEnchantId)
        ? getWikiEnchant(slot.soulEnchantId)
        : null

    if (s1) layerPresence[slot.slot].s1 = layerHasContent(s1, "s1")
    if (s2) layerPresence[slot.slot].s2 = layerHasContent(s2, "s2")
    if (s3) layerPresence[slot.slot].s3 = layerHasContent(s3, "s3")
    if (tarot) {
      layerPresence[slot.slot].tarot = enchantSideHasContent(tarot.tarot)
    }
    if (soul) {
      layerPresence[slot.slot].soul = enchantSideHasContent(soul.soul)
    }

    for (const def of PLANNER_STATS) {
      const layers = byStat[def.key].bySlotLayers[slot.slot]
      if (s1) {
        layers.s1 += contribFromAdjustments(s1Adjustments(s1.id), def)
      }
      if (s2) {
        layers.s2 += contribFromAdjustments(s2Adjustments(s2), def)
      }
      if (s3) {
        layers.s3 += contribFromAdjustments(s3Adjustments(s3), def)
      }
      if (tarot) {
        layers.tarot += contribFromAdjustments(
          enchantSideAdjustments(tarot.tarot, attrs, lnc),
          def
        )
      }
      if (soul) {
        layers.soul += contribFromAdjustments(
          enchantSideAdjustments(soul.soul, attrs, lnc),
          def
        )
      }
      byStat[def.key].bySlot[slot.slot] =
        layers.s1 + layers.s2 + layers.s3 + layers.tarot + layers.soul
    }
  }

  const { activeSets, partialSets } = activeAndPartialSets(equipment)
  for (const set of activeSets) {
    const rows: TokuseiRow[] = []
    for (const tokId of set.tokuseiIds) rows.push(...tokuseiRows(tokId))
    for (const def of PLANNER_STATS) {
      const v = contribFromAdjustments(rows, def)
      if (v !== 0) byStat[def.key].setBonus += v
    }
  }

  const chantAttr = chantAttrReduction(attrs)
  const cdAttr = cooldownAttrReduction(attrs)
  byStat.incant.attrBonus = chantAttr === 0 ? 0 : -chantAttr
  byStat.cooldown.attrBonus = cdAttr === 0 ? 0 : -cdAttr

  for (const def of PLANNER_STATS) {
    const bd = byStat[def.key]
    let pieceSum = 0
    for (const slot of EQUIP_SLOTS) pieceSum += bd.bySlot[slot.key]
    bd.gearTotal = pieceSum + bd.setBonus + bd.attrBonus

    if (def.kind === "reduction") {
      bd.raw = 100 + bd.gearTotal
    } else if (def.kind === "lbCap") {
      bd.raw = (def.baseTotal ?? LB_CAP_BASE) + pieceSum + bd.setBonus
    } else {
      bd.raw = pieceSum + bd.setBonus
    }
    bd.atCap = isAtCap(def, bd.raw)
  }

  return {
    byStat,
    layerPresence,
    activeSets,
    partialSets,
    setColorIndexBySlot: setColorIndexBySlot(equipment, [
      ...activeSets,
      ...partialSets,
    ]),
  }
}

export type RankedGearHit = {
  item: WikiItem
  slotKey: EquipSlotKey
  pieceContribution: number
  setCompletionBonus: number
  score: number
  completesSetIds: number[]
}

export function rankItemsForStat(options: {
  stat: PlannerStatKey
  slot?: EquipSlotKey | null
  loadout?: PlannerSlot[]
  excludeEquipped?: boolean
  gender?: 0 | 1 | null
  /** When set, only items matching this subcategory (spirit-fuse family). */
  subcategory?: number | null
  limit?: number
  query?: string
}): RankedGearHit[] {
  const def = PLANNER_STATS.find((s) => s.key === options.stat)
  if (!def) return []

  const limit = options.limit ?? 40
  const loadout = options.loadout ?? emptyPlannerLoadout()
  const equippedIds = new Set(
    loadout.map((s) => s.s1ItemId).filter((id): id is number => id != null)
  )
  const q = options.query?.trim().toLowerCase() ?? ""
  const gender = options.gender

  const pool = listWikiItems().filter((item) => {
    const slotKey = equipSlotKeyFromWikiSlot(item.equipSlot)
    if (!slotKey) return false
    if (options.slot && slotKey !== options.slot) return false
    if (options.excludeEquipped && equippedIds.has(item.id)) return false
    if (gender === 0 || gender === 1) {
      if (item.gender !== 2 && item.gender !== gender) return false
    }
    if (options.subcategory != null) {
      const sub = itemSubcategory(item.id)
      if (sub != null && sub !== options.subcategory) return false
    }
    if (
      q &&
      !item.name.toLowerCase().includes(q) &&
      !String(item.id).includes(q)
    ) {
      return false
    }
    return true
  })

  const hits: RankedGearHit[] = []
  for (const item of pool) {
    const slotKey = equipSlotKeyFromWikiSlot(item.equipSlot)!
    const pieceContribution = itemPieceContribution(item, options.stat)

    const trial = equipWikiItemOntoSlot(loadout, slotKey, item)
    const before = activeAndPartialSets(loadout).activeSets.map((s) => s.id)
    const after = activeAndPartialSets(trial).activeSets
    const newlyComplete = after.filter((s) => !before.includes(s.id))

    let setCompletionBonus = 0
    const completesSetIds: number[] = []
    for (const set of newlyComplete) {
      const rows: TokuseiRow[] = []
      for (const tokId of set.tokuseiIds) rows.push(...tokuseiRows(tokId))
      const v = contribFromAdjustments(rows, def)
      if (v !== 0) {
        setCompletionBonus += v
        completesSetIds.push(set.id)
      } else if (set.tokuseiIds.length > 0) {
        completesSetIds.push(set.id)
      }
    }

    const combined = pieceContribution + setCompletionBonus
    if (combined === 0 && completesSetIds.length === 0) continue

    const score = def.kind === "reduction" ? -combined : combined

    hits.push({
      item,
      slotKey,
      pieceContribution,
      setCompletionBonus,
      score,
      completesSetIds,
    })
  }

  hits.sort((a, b) => b.score - a.score || a.item.id - b.item.id)
  return hits.slice(0, limit)
}

export const GEAR_LAYER_MIME = "application/x-gear-layer"

export type GearLayerDragPayload = {
  itemId: number
  layer: GearLayer
}

export const GEAR_ENCHANT_MIME = "application/x-gear-enchant"

export type GearEnchantDragPayload = {
  enchantId: number
  side: EnchantSide
}

export type RankedEnchantHit = {
  enchant: WikiEnchantRecord
  side: EnchantSide
  contribution: number
  score: number
  effectName: string
  sourceName: string
  lines: string[]
}

export function rankEnchantsForStat(options: {
  stat: PlannerStatKey
  side: EnchantSide
  attrs: PlannerAttrs
  lnc: PlannerLnc
  limit?: number
  query?: string
}): RankedEnchantHit[] {
  const def = PLANNER_STATS.find((s) => s.key === options.stat)
  if (!def) return []
  const limit = options.limit ?? 40
  const q = options.query?.trim().toLowerCase() ?? ""

  const hits: RankedEnchantHit[] = []
  for (const enchant of listWikiEnchants()) {
    const sideData =
      options.side === "tarot" ? enchant.tarot : enchant.soul
    if (!enchantSideHasContent(sideData)) continue
    const effectName = sideData.name.trim() || `Enchant #${enchant.id}`
    const sourceName =
      enchant.sourceName ??
      getWikiItem(enchant.crystalItemId)?.name ??
      `Crystal #${enchant.crystalItemId}`
    if (
      q &&
      !effectName.toLowerCase().includes(q) &&
      !sourceName.toLowerCase().includes(q) &&
      !String(enchant.id).includes(q) &&
      !String(enchant.crystalItemId).includes(q)
    ) {
      continue
    }
    const contribution = contribFromAdjustments(
      enchantSideAdjustments(sideData, options.attrs, options.lnc),
      def
    )
    if (contribution === 0 && sideData.lines.length === 0) continue
    const score = def.kind === "reduction" ? -contribution : contribution
    hits.push({
      enchant,
      side: options.side,
      contribution,
      score,
      effectName,
      sourceName,
      lines: sideData.lines,
    })
  }

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      a.enchant.id - b.enchant.id
  )
  return hits.slice(0, limit)
}

export type { PlannerLnc }

export const WIKI_STAT_FILTER_OPTIONS: {
  id: string
  label: string
}[] = [
  { id: "CRITICAL", label: "Critical" },
  { id: "FINAL_CRIT_CHANCE", label: "Final crit chance" },
  { id: "LB_CHANCE", label: "Limit break chance" },
  { id: "LB_DAMAGE", label: "Limit break power" },
  { id: "CHANT_TIME", label: "Chant time / Incant" },
  { id: "COOLDOWN_TIME", label: "Cooldown time" },
  { id: "PDEF", label: "PDEF" },
  { id: "MDEF", label: "MDEF" },
  { id: "HP_MAX", label: "Max HP" },
  { id: "MP_MAX", label: "Max MP" },
  { id: "STR", label: "STR" },
  { id: "MAGIC", label: "MAG" },
  { id: "VIT", label: "VIT" },
  { id: "INT", label: "INT" },
  { id: "SPEED", label: "SPD" },
  { id: "LUCK", label: "LUCK" },
]

export const SET_HEADER_COLORS = [
  "#7c5cbf",
  "#c9a227",
  "#c44c4c",
  "#3d9e6f",
  "#5a4a8a",
  "#8a8a8a",
  "#d4782e",
  "#8bc34a",
  "#4aa8c9",
  "#d4a84a",
  "#bf5c8a",
  "#5c8abf",
]
