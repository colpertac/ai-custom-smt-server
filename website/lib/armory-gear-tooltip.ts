import {
  formatWikiStatValue,
  getWikiItem,
  resolveSoulFusionByEnchantId,
  resolveTarotFusionByEnchantId,
  wikiBasicFeatures,
  wikiCharacteristics,
  wikiSetBonus,
  type WikiFusionView,
  type WikiItemStat,
} from "@/content/wiki"

export type ArmoryGearSlotView = {
  label: string
  itemType: number | null
  name: string | null
  level?: number | null
  iconSrc?: string | null
  tarot: number
  soul: number
  basicEffect: number
  specialEffect: number
  modSlots: number[]
}

export type ResolvedArmoryGearFeatures = {
  itemType: number
  name: string
  slotLabel: string
  itemLevel: number | null
  iconSrc: string | null
  setBonus: string[]
  basicFeatures: WikiItemStat[]
  basicSourceId: number
  basicSourceName: string | null
  characteristics: WikiItemStat[]
  specialSourceId: number
  specialSourceName: string | null
  tarot: number
  soul: number
  tarotFusion: WikiFusionView | null
  soulFusion: WikiFusionView | null
  modSlots: number[]
}

export function resolveArmoryGearFeatures(
  slot: ArmoryGearSlotView
): ResolvedArmoryGearFeatures | null {
  if (slot.itemType == null) return null

  const base = getWikiItem(slot.itemType)
  const basicId =
    slot.basicEffect > 0 && slot.basicEffect !== slot.itemType
      ? slot.basicEffect
      : slot.itemType
  const specialId =
    slot.specialEffect > 0 && slot.specialEffect !== slot.itemType
      ? slot.specialEffect
      : slot.itemType

  const basicItem = getWikiItem(basicId)
  const specialItem = getWikiItem(specialId)

  return {
    itemType: slot.itemType,
    name: slot.name ?? base?.name ?? `Item ${slot.itemType}`,
    slotLabel: slot.label,
    itemLevel: slot.level ?? base?.level ?? null,
    iconSrc: slot.iconSrc ?? base?.iconSrc ?? null,
    setBonus: base ? wikiSetBonus(base) : [],
    basicFeatures: basicItem ? wikiBasicFeatures(basicItem) : [],
    basicSourceId: basicId,
    basicSourceName: basicItem?.name ?? null,
    characteristics: specialItem ? wikiCharacteristics(specialItem) : [],
    specialSourceId: specialId,
    specialSourceName: specialItem?.name ?? null,
    tarot: slot.tarot,
    soul: slot.soul,
    tarotFusion: resolveTarotFusionByEnchantId(slot.tarot),
    soulFusion: resolveSoulFusionByEnchantId(slot.soul),
    modSlots: slot.modSlots,
  }
}

export function formatArmoryStatLine(stat: WikiItemStat): string {
  return `${formatWikiStatValue(stat)} ${stat.label}`
}
