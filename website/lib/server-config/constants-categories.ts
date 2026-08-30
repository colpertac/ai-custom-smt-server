/** Constants.xml categories by name prefix (All = everything). */

export type ConstantCategoryId =
  | "all"
  | "skills"
  | "items"
  | "menus"
  | "status"
  | "gm"
  | "api"
  | "demons"
  | "fusion"
  | "other"

export type ConstantCategory = {
  id: ConstantCategoryId
  label: string
  /** Match if constant name starts with any of these prefixes (plus `_`). */
  prefixes?: string[]
}

export const CONSTANT_CATEGORIES: ConstantCategory[] = [
  { id: "all", label: "All" },
  { id: "skills", label: "Skills", prefixes: ["SKILL_"] },
  {
    id: "items",
    label: "Items",
    prefixes: ["ITEM_", "VALUABLE_", "EQUIP_", "BARTER_"],
  },
  { id: "menus", label: "Menus", prefixes: ["MENU_"] },
  { id: "status", label: "Status", prefixes: ["STATUS_", "TOKUSEI_"] },
  { id: "gm", label: "GM", prefixes: ["GM_"] },
  { id: "api", label: "API", prefixes: ["API_"] },
  {
    id: "demons",
    label: "Demons",
    prefixes: ["DEMON_", "MITAMA_", "ELEMENTAL_", "SPIRIT_", "CAMEO_", "VA_"],
  },
  {
    id: "fusion",
    label: "Fusion",
    prefixes: ["FUSION_", "TRIFUSION_", "DIGITALIZE_", "SYNTH_", "REUNION_"],
  },
  {
    id: "other",
    label: "Other",
    // Catch-all — computed in filterConstantsByCategory
  },
]

const KNOWN_PREFIXES = CONSTANT_CATEGORIES.flatMap((c) => c.prefixes ?? [])

export function constantCategoryFor(name: string): ConstantCategoryId {
  for (const cat of CONSTANT_CATEGORIES) {
    if (cat.id === "all" || cat.id === "other" || !cat.prefixes) continue
    if (cat.prefixes.some((p) => name.startsWith(p))) return cat.id
  }
  return "other"
}

export function filterConstantsByCategory(
  entries: { name: string; value: string }[],
  category: ConstantCategoryId
): { name: string; value: string }[] {
  if (category === "all") return entries
  if (category === "other") {
    return entries.filter(
      (e) => !KNOWN_PREFIXES.some((p) => e.name.startsWith(p))
    )
  }
  const cat = CONSTANT_CATEGORIES.find((c) => c.id === category)
  if (!cat?.prefixes?.length) return entries
  return entries.filter((e) => cat.prefixes!.some((p) => e.name.startsWith(p)))
}

export function countByCategory(
  entries: { name: string; value: string }[]
): Record<ConstantCategoryId, number> {
  const out = Object.fromEntries(
    CONSTANT_CATEGORIES.map((c) => [c.id, 0])
  ) as Record<ConstantCategoryId, number>
  out.all = entries.length
  for (const e of entries) {
    out[constantCategoryFor(e.name)]++
  }
  return out
}
