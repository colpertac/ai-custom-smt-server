import type { WikiItem, WikiItemCategory, WikiItemStat } from "@/content/wiki/types"

const WEAPON_EQUIP_TYPES = new Set(["EQUIP_TYPE_WEAPON"])

const ARMOR_EQUIP_TYPES = new Set([
  "EQUIP_TYPE_HEAD",
  "EQUIP_TYPE_FACE",
  "EQUIP_TYPE_NECK",
  "EQUIP_TYPE_EARRING",
  "EQUIP_TYPE_TOP",
  "EQUIP_TYPE_BOTTOM",
  "EQUIP_TYPE_ARMS",
  "EQUIP_TYPE_BACK",
  "EQUIP_TYPE_FEET",
  "EQUIP_TYPE_RING",
  "EQUIP_TYPE_TALISMAN",
  "EQUIP_TYPE_EXTRA",
  "EQUIP_TYPE_COMP",
])

export function getWikiItemCategory(item: WikiItem): WikiItemCategory {
  const equip = item.equipType || ""
  if (WEAPON_EQUIP_TYPES.has(equip)) return "weapons"
  if (equip === "EQUIP_TYPE_WEAPON") return "weapons"
  if (ARMOR_EQUIP_TYPES.has(equip)) return "armor"
  const slot = (item.equipSlot || "").toLowerCase()
  if (slot === "weapon") return "weapons"
  if (
    [
      "head",
      "face",
      "neck",
      "earring",
      "top",
      "bottom",
      "arms",
      "back",
      "feet",
      "ring",
      "talisman",
      "extra",
      "comp",
    ].includes(slot)
  ) {
    return "armor"
  }
  return "items"
}

/** S2 — basic features (correctTbl type 0). */
export function wikiBasicFeatures(item: WikiItem): WikiItemStat[] {
  if (item.basicFeatures) return item.basicFeatures
  return item.stats.filter((row) => row.type === 0)
}

/** S3 — characteristics (correctTbl type 1/2). */
export function wikiCharacteristics(item: WikiItem): WikiItemStat[] {
  if (item.characteristics) return item.characteristics
  return item.stats.filter((row) => row.type === 1 || row.type === 2)
}

/** S1 — set bonus lines from SItem tokusei. */
export function wikiSetBonus(item: WikiItem): string[] {
  return item.setBonus ?? []
}

/** True if a catalog item can be worn by this character gender. */
export function wikiItemFitsGender(
  item: WikiItem,
  gender: 0 | 1 | null | undefined
): boolean {
  if (gender == null) return true
  // 2 = any / neutral
  return item.gender === 2 || item.gender === gender
}

export function formatWikiStatValue(stat: WikiItemStat): string {
  const id = stat.id
  if (
    id.startsWith("RATE_") ||
    id.startsWith("BOOST_") ||
    id === "LB_CHANCE" ||
    id === "LB_DAMAGE" ||
    id === "FINAL_CRIT_CHANCE" ||
    id === "CHANT_TIME" ||
    id === "COOLDOWN_TIME"
  ) {
    return stat.value > 0 ? `+${stat.value}%` : `${stat.value}%`
  }
  return stat.value > 0 ? `+${stat.value}` : String(stat.value)
}
