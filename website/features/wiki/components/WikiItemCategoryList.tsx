import Link from "next/link"

import {
  listWikiItems,
  wikiItemsSample,
  type WikiItemCategory,
} from "@/content/wiki"
import { WikiGenderBadge } from "@/features/wiki/components/WikiGenderBadge"
import { WikiItemIcon } from "@/features/wiki/components/WikiItemIcon"

const TITLES: Record<WikiItemCategory, string> = {
  weapons: "Weapons",
  armor: "Armor",
  items: "Items",
}

const BLURBS: Record<WikiItemCategory, string> = {
  weapons: "Equip slot Weapon (melee, guns, and other arms).",
  armor:
    "Wearable gear — head, body, feet, rings, COMP, and other non-weapon slots.",
  items: "Consumables and other non-equipped entries.",
}

export function WikiItemCategoryList({
  category,
}: {
  category: WikiItemCategory
}) {
  const items = listWikiItems(category)

  return (
    <section className="mx-auto max-w-3xl">
      <p className="text-xs tracking-wide text-muted-foreground">
        <Link href="/wiki" className="hover:text-gold-dim">
          Item DB
        </Link>
        <span className="mx-2 text-border">/</span>
        {TITLES[category]}
      </p>
      <h1 className="font-heading mt-2 text-3xl font-semibold tracking-[0.12em] uppercase">
        {TITLES[category]}
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 text-sm text-muted-foreground">
        {BLURBS[category]} {wikiItemsSample.note}
      </p>

      {items.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No sample entries in this category yet.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/80 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium"> </th>
                <th className="px-3 py-2 font-medium">ID</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Slot</th>
                {category === "armor" ? (
                  <th className="px-3 py-2 font-medium">Gender</th>
                ) : null}
                <th className="px-3 py-2 font-medium">Key stats</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const preview = item.stats
                  .slice(0, 3)
                  .map(
                    (s) =>
                      `${s.label} ${s.value > 0 ? `+${s.value}` : s.value}`
                  )
                  .join(" · ")
                return (
                  <tr
                    key={item.id}
                    className="border-t border-border hover:bg-muted/40"
                  >
                    <td className="px-3 py-2">
                      <WikiItemIcon item={item} size={32} />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {item.id}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/wiki/items/${item.id}`}
                        className="font-medium text-foreground underline-offset-2 hover:text-gold-hot hover:underline"
                      >
                        {item.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {item.equipSlot}
                      {item.weaponType && item.weaponType !== "NONE"
                        ? ` · ${item.weaponType}`
                        : ""}
                    </td>
                    {category === "armor" ? (
                      <td className="px-3 py-2">
                        <WikiGenderBadge
                          gender={item.gender}
                          label={item.genderLabel}
                        />
                      </td>
                    ) : null}
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {preview || "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
