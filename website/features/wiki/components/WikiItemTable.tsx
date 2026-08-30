import Link from "next/link"

import type { WikiItem, WikiItemCategory } from "@/content/wiki"
import { getWikiItemCategory, wikiBasicFeatures } from "@/content/wiki"
import { WikiGenderBadge } from "@/features/wiki/components/WikiGenderBadge"
import { WikiItemIcon } from "@/features/wiki/components/WikiItemIcon"
import { WIKI_CATEGORY_META } from "@/features/wiki/wiki-nav"
import { cn } from "@/lib/utils"

export function WikiItemTable({
  items,
  category,
  showCategory = false,
  className,
}: {
  items: WikiItem[]
  category?: WikiItemCategory
  showCategory?: boolean
  className?: string
}) {
  if (items.length === 0) return null

  return (
    <div
      className={cn(
        "overflow-x-auto border border-border bg-card/40",
        className
      )}
    >
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/80 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 font-medium"> </th>
            <th className="px-3 py-2.5 font-medium">ID</th>
            <th className="px-3 py-2.5 font-medium">Name</th>
            {showCategory ? (
              <th className="px-3 py-2.5 font-medium">Type</th>
            ) : null}
            <th className="px-3 py-2.5 font-medium">Slot</th>
            {category === "armor" ? (
              <th className="px-3 py-2.5 font-medium">Gender</th>
            ) : null}
            <th className="px-3 py-2.5 font-medium">Stats</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const itemCategory = getWikiItemCategory(item)
            const preview = wikiBasicFeatures(item)
              .slice(0, 3)
              .map(
                (s) => `${s.label} ${s.value > 0 ? `+${s.value}` : s.value}`
              )
              .join(" · ")

            return (
              <tr
                key={item.id}
                className="border-t border-border transition-colors hover:bg-muted/40"
              >
                <td className="px-3 py-2">
                  <WikiItemIcon item={item} size={36} />
                </td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  {item.id}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/wiki/items/${item.id}`}
                    className="font-medium text-foreground no-underline hover:text-gold-hot hover:underline"
                  >
                    {item.name}
                  </Link>
                  {item.level > 0 ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      Lv {item.level}
                    </span>
                  ) : null}
                </td>
                {showCategory ? (
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    <Link
                      href={WIKI_CATEGORY_META[itemCategory].href}
                      className="no-underline hover:text-gold-dim"
                    >
                      {WIKI_CATEGORY_META[itemCategory].title}
                    </Link>
                  </td>
                ) : null}
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
  )
}
