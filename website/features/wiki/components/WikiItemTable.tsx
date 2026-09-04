import Link from "next/link"

import type { WikiItem, WikiItemCategory, WikiItemStat } from "@/content/wiki"
import {
  formatWikiStatValue,
  getWikiItemCategory,
  wikiBasicFeatures,
  wikiCharacteristics,
  wikiSetBonus,
} from "@/content/wiki"
import { WikiGenderBadge } from "@/features/wiki/components/WikiGenderBadge"
import { WikiItemIcon } from "@/features/wiki/components/WikiItemIcon"
import { WIKI_CATEGORY_META } from "@/features/wiki/wiki-nav"
import { cn } from "@/lib/utils"

const LAYER_COL: Record<"s1" | "s2" | "s3", string> = {
  s1: "border-l-2 border-sky-500/50",
  s2: "border-l-2 border-emerald-500/50",
  s3: "border-l-2 border-rose-500/50",
}

const LAYER_HEAD: Record<"s1" | "s2" | "s3", string> = {
  s1: "text-sky-300/90",
  s2: "text-emerald-300/90",
  s3: "text-rose-300/90",
}

function LayerLines({
  layer,
  lines,
  stats,
}: {
  layer: "s1" | "s2" | "s3"
  lines?: string[]
  stats?: WikiItemStat[]
}) {
  if (stats && stats.length > 0) {
    return (
      <ul
        className={cn(
          "gap-x-3 gap-y-0.5 pl-1.5 text-xs",
          stats.length > 3 ? "grid grid-cols-2" : "flex flex-col",
          LAYER_COL[layer]
        )}
      >
        {stats.map((s) => (
          <li
            key={`${s.id}-${s.type}`}
            className="min-w-0 leading-snug break-words"
          >
            <span className="text-muted-foreground">{s.label}</span>{" "}
            <span className="font-mono text-foreground">
              {formatWikiStatValue(s)}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  if (lines && lines.length > 0) {
    return (
      <ul className={cn("flex flex-col gap-0.5 pl-1.5 text-xs", LAYER_COL[layer])}>
        {lines.map((line) => (
          <li key={line} className="min-w-0 leading-snug break-words">
            {line}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <span className={cn("pl-1.5 text-xs text-muted-foreground", LAYER_COL[layer])}>
      —
    </span>
  )
}

function showsLayerColumns(category?: WikiItemCategory): boolean {
  return category === "weapons" || category === "armor"
}

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

  const layers = showsLayerColumns(category)

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
            {layers ? (
              <>
                <th className={cn("px-2 py-2.5 font-medium", LAYER_HEAD.s1)}>
                  S1 - Set Bonus
                </th>
                <th className={cn("px-2 py-2.5 font-medium", LAYER_HEAD.s2)}>
                  S2 - Basic Features
                </th>
                <th className={cn("px-2 py-2.5 font-medium", LAYER_HEAD.s3)}>
                  S3 - Characteristics
                </th>
              </>
            ) : (
              <th className="px-3 py-2.5 font-medium">Stats</th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const itemCategory = getWikiItemCategory(item)
            const setBonus = wikiSetBonus(item)
            const basic = wikiBasicFeatures(item)
            const chars = wikiCharacteristics(item)
            const preview = basic
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
                <td className="px-3 py-2 align-top">
                  <WikiItemIcon item={item} size={36} />
                </td>
                <td className="px-3 py-2 align-top font-mono text-xs text-muted-foreground">
                  {item.id}
                </td>
                <td className="px-3 py-2 align-top">
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
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                    <Link
                      href={WIKI_CATEGORY_META[itemCategory].href}
                      className="no-underline hover:text-gold-dim"
                    >
                      {WIKI_CATEGORY_META[itemCategory].title}
                    </Link>
                  </td>
                ) : null}
                <td className="px-3 py-2 align-top text-muted-foreground">
                  {item.equipSlot}
                  {item.weaponType && item.weaponType !== "NONE"
                    ? ` · ${item.weaponType}`
                    : ""}
                </td>
                {category === "armor" ? (
                  <td className="px-3 py-2 align-top">
                    <WikiGenderBadge
                      gender={item.gender}
                      label={item.genderLabel}
                    />
                  </td>
                ) : null}
                {layers ? (
                  <>
                    <td className="max-w-[14rem] px-2 py-2 align-top">
                      <LayerLines layer="s1" lines={setBonus} />
                    </td>
                    <td className="max-w-[16rem] px-2 py-2 align-top">
                      <LayerLines layer="s2" stats={basic} />
                    </td>
                    <td className="max-w-[16rem] px-2 py-2 align-top">
                      <LayerLines layer="s3" stats={chars} />
                    </td>
                  </>
                ) : (
                  <td className="px-3 py-2 align-top text-xs text-muted-foreground">
                    {preview || "—"}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
