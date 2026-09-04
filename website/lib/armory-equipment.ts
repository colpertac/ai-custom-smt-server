/** MiItemBasicData.equipType indices used as EquippedItems array slots. */
export const EQUIP_SLOTS = [
  { index: 0, key: "head", label: "Head" },
  { index: 1, key: "face", label: "Face" },
  { index: 2, key: "neck", label: "Neck" },
  { index: 3, key: "top", label: "Top" },
  { index: 4, key: "arms", label: "Arms" },
  { index: 5, key: "bottom", label: "Bottom" },
  { index: 6, key: "feet", label: "Feet" },
  { index: 7, key: "comp", label: "COMP" },
  { index: 8, key: "ring", label: "Ring" },
  { index: 9, key: "earring", label: "Earring" },
  { index: 10, key: "extra", label: "Extra" },
  { index: 11, key: "back", label: "Back" },
  { index: 12, key: "talisman", label: "Talisman" },
  { index: 13, key: "weapon", label: "Weapon" },
  { index: 14, key: "bullets", label: "Bullets" },
] as const

export type EquipSlotKey = (typeof EQUIP_SLOTS)[number]["key"]

export type ArmoryEquipmentSlot = {
  slot: EquipSlotKey
  label: string
  index: number
  itemType: number | null
  name: string | null
  level: number | null
  iconSrc: string | null
  tarot: number
  soul: number
  basicEffect: number
  specialEffect: number
  modSlots: number[]
}
