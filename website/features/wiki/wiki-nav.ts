import type { WikiItemCategory } from "@/content/wiki"

export const WIKI_NAV = [
  { href: "/wiki", label: "Home", exact: true },
  { href: "/wiki/search", label: "Search", prefix: "/wiki/search" },
  { href: "/wiki/weapons", label: "Weapons", prefix: "/wiki/weapons" },
  { href: "/wiki/armor", label: "Armor", prefix: "/wiki/armor" },
  { href: "/wiki/items", label: "Items", prefix: "/wiki/items" },
] as const

export const WIKI_CATEGORY_META: Record<
  WikiItemCategory,
  { href: string; title: string; blurb: string }
> = {
  weapons: {
    href: "/wiki/weapons",
    title: "Weapons",
    blurb: "Melee, guns, and everything that uses the Weapon equip slot.",
  },
  armor: {
    href: "/wiki/armor",
    title: "Armor",
    blurb: "Head, body, feet, rings, COMP, and other wearable slots.",
  },
  items: {
    href: "/wiki/items",
    title: "Items",
    blurb: "Consumables, materials, and non-equipped entries.",
  },
}

export function wikiNavActive(
  pathname: string,
  item: typeof WIKI_NAV[number]
): boolean {
  if ("exact" in item && item.exact) return pathname === item.href
  if ("prefix" in item && item.prefix) return pathname.startsWith(item.prefix)
  return pathname === item.href
}
