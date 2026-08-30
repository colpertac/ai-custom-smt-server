import sample from "@/content/wiki/items-sample.json"

export type WikiItemStat = {
  id: string
  label: string
  type: number
  value: number
}

export type WikiItem = {
  id: number
  name: string
  description: string
  icon: number
  iconAsset?: string | null
  iconSrc?: string | null
  equipType: string
  equipSlot: string
  weaponType: string | null
  /** COMP: 0 male, 1 female, 2 any */
  gender: number
  genderLabel: string
  buyPrice: number
  sellPrice: number
  level: number
  durability: number
  stackSize: number
  stats: WikiItemStat[]
}

export type WikiItemsPayload = {
  source: string
  namesSource: string
  iconsSource?: string
  generatedAt: string
  note: string
  items: WikiItem[]
}

/** Browse buckets for Item DB cards / filtered lists. */
export type WikiItemCategory = "weapons" | "armor" | "items"

export const wikiItemsSample = sample as WikiItemsPayload

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
  // Handgun / melee / etc. still use WEAPON slot; weaponType is flavor only.
  if (equip === "EQUIP_TYPE_WEAPON") return "weapons"
  if (ARMOR_EQUIP_TYPES.has(equip)) return "armor"
  // Slot label fallback if equipType string ever differs
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

export function getWikiItem(id: number): WikiItem | undefined {
  return wikiItemsSample.items.find((item) => item.id === id)
}

export function listWikiItems(category?: WikiItemCategory): WikiItem[] {
  const all = [...wikiItemsSample.items].sort((a, b) => a.id - b.id)
  if (!category) return all
  return all.filter((item) => getWikiItemCategory(item) === category)
}

export function countWikiItems(category: WikiItemCategory): number {
  return listWikiItems(category).length
}
