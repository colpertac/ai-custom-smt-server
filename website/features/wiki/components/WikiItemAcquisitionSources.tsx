import Link from "next/link"

import { getDevilName } from "@/lib/devil-catalog"
import type {
  ItemDropSource,
  ItemQuestRequireSource,
  ItemSourceEntry,
  ItemWorldShopSource,
} from "@/lib/item-sources-load"
import { cn } from "@/lib/utils"
import type { ItemQuestSource } from "@/lib/wiki-quest-guide"
import { zoneLabel } from "@/lib/zone-names"

function dropKindLabel(kind: string): string {
  switch (kind) {
    case "plasma":
      return "Plasma node"
    case "enemyGift":
    case "enemyGiftInline":
      return "Enemy gift"
    case "enemyInline":
      return "Inline enemy drop"
    default:
      return "Enemy drop"
  }
}

function stackLabel(drop: ItemDropSource): string | null {
  if (drop.minStack == null && drop.maxStack == null) return null
  const min = drop.minStack ?? drop.maxStack
  const max = drop.maxStack ?? drop.minStack
  if (min === max) return `×${min}`
  return `×${min}–${max}`
}

function questTitle(row: ItemQuestRequireSource): string {
  return row.title || row.questTitle || `Quest ${row.questId}`
}

function DropRow({ drop }: { drop: ItemDropSource }) {
  const enemy =
    drop.enemyType != null
      ? `${getDevilName(drop.enemyType)} (#${drop.enemyType})`
      : null
  const rate =
    drop.rate != null && Number.isFinite(drop.rate) ? `${drop.rate}%` : null
  const stack = stackLabel(drop)

  return (
    <li className="border border-border/70 bg-muted/10 px-3 py-2 text-sm">
      <p className="font-medium text-foreground">{zoneLabel(drop.zoneId)}</p>
      <p className="mt-0.5 text-muted-foreground">
        {dropKindLabel(drop.kind)}
        {enemy ? (
          <>
            {" · "}
            <span className="text-foreground/90">{enemy}</span>
          </>
        ) : null}
        {rate ? (
          <>
            {" · "}
            <span className="font-mono text-gold-hot">{rate}</span>
          </>
        ) : null}
        {stack ? (
          <>
            {" · "}
            <span className="font-mono">{stack}</span>
          </>
        ) : null}
      </p>
    </li>
  )
}

function WorldShopRow({ row }: { row: ItemWorldShopSource }) {
  return (
    <li className="border border-border/70 bg-muted/10 px-3 py-2 text-sm">
      <p className="font-medium text-foreground">
        {row.shopName || `Shop #${row.shopId}`}
        <span className="ml-1.5 font-mono text-[0.65rem] font-normal text-muted-foreground">
          #{row.shopId}
        </span>
      </p>
      <p className="mt-0.5 text-muted-foreground">
        {row.tabName ? <span>{row.tabName}</span> : null}
        {row.basePrice != null ? (
          <>
            {row.tabName ? " · " : null}
            <span className="font-mono font-semibold text-gold-hot">
              {row.basePrice.toLocaleString()} {row.currency || "Macca"}
            </span>
          </>
        ) : null}
      </p>
    </li>
  )
}

function QuestRequireRow({ row }: { row: ItemQuestRequireSource }) {
  return (
    <li className="border border-border/70 bg-muted/10 px-3 py-2 text-sm">
      <p className="font-medium text-foreground">
        <Link
          href={`/wiki/quests/${row.questId}`}
          className="text-gold-dim no-underline hover:text-gold-hot"
        >
          {questTitle(row)}
        </Link>
      </p>
      <p className="mt-0.5 text-muted-foreground">
        Quest #{row.questId}
        {row.phaseNumber != null ? ` · phase ${row.phaseNumber}` : null}
        {row.objectCount != null ? (
          <>
            {" · "}
            <span className="font-mono">×{row.objectCount}</span>
          </>
        ) : null}
      </p>
    </li>
  )
}

function QuestGiverRow({ row }: { row: ItemQuestSource }) {
  return (
    <li className="border border-border/70 bg-muted/10 px-3 py-2 text-sm">
      <p className="font-medium text-foreground">
        <Link
          href={`/wiki/quests/${row.questId}`}
          className="text-gold-dim no-underline hover:text-gold-hot"
        >
          {row.title}
        </Link>
      </p>
      <p className="mt-0.5 text-muted-foreground">
        {row.reward ? "Quest reward" : "Given during the quest"}
        {row.count > 1 ? (
          <>
            {" · "}
            <span className="font-mono">×{row.count}</span>
          </>
        ) : null}
      </p>
    </li>
  )
}

function Subsection({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <h3 className="text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  )
}

/** Cap long lists so item pages stay readable. */
const DROP_LIMIT = 12
const SHOP_LIMIT = 8
const QUEST_LIMIT = 8

export function WikiItemAcquisitionSources({
  entry,
  questSources = [],
}: {
  entry: ItemSourceEntry | undefined
  questSources?: ItemQuestSource[]
}) {
  const drops = entry?.drops ?? []
  const shops = entry?.worldShops ?? []
  const quests = entry?.questRequires ?? []
  if (!drops.length && !shops.length && !quests.length && !questSources.length)
    return null

  const shownDrops = drops.slice(0, DROP_LIMIT)
  const shownShops = shops.slice(0, SHOP_LIMIT)
  const shownQuests = quests.slice(0, QUEST_LIMIT)
  // Turn-in rewards first, then items handed out mid-quest.
  const givers = [...questSources].sort(
    (a, b) => Number(b.reward) - Number(a.reward)
  )
  const shownGivers = givers.slice(0, QUEST_LIMIT)

  return (
    <section className="border border-border bg-muted/20 p-3">
      <h2 className="font-heading text-xs font-semibold tracking-[0.12em] text-gold-dim uppercase">
        Acquisition
      </h2>
      <p className="mt-1 text-[0.7rem] leading-snug text-muted-foreground">
        Enemy drops, world NPC shops, quests that give or require this item on
        this server. COMP shops are listed separately above when available.
      </p>

      <div className="mt-2.5 space-y-3">
        {shownDrops.length ? (
          <Subsection title="Drops / plasma">
            {shownDrops.map((drop, i) => (
              <DropRow
                key={`${drop.kind}-${drop.zoneId}-${drop.enemyType}-${drop.dropSetId}-${i}`}
                drop={drop}
              />
            ))}
            {drops.length > DROP_LIMIT ? (
              <li className="text-[0.7rem] text-muted-foreground">
                +{drops.length - DROP_LIMIT} more drop rows in catalog
              </li>
            ) : null}
          </Subsection>
        ) : null}

        {shownShops.length ? (
          <Subsection title="World NPC shops">
            {shownShops.map((row) => (
              <WorldShopRow
                key={`${row.shopId}-${row.tabName}-${row.productId}`}
                row={row}
              />
            ))}
            {shops.length > SHOP_LIMIT ? (
              <li className="text-[0.7rem] text-muted-foreground">
                +{shops.length - SHOP_LIMIT} more shop listings
              </li>
            ) : null}
          </Subsection>
        ) : null}

        {shownGivers.length ? (
          <Subsection title="From quests">
            {shownGivers.map((row) => (
              <QuestGiverRow key={row.questId} row={row} />
            ))}
            {givers.length > QUEST_LIMIT ? (
              <li className="text-[0.7rem] text-muted-foreground">
                +{givers.length - QUEST_LIMIT} more quests
              </li>
            ) : null}
          </Subsection>
        ) : null}

        {shownQuests.length ? (
          <Subsection title="Required by quests">
            {shownQuests.map((row) => (
              <QuestRequireRow
                key={`${row.questId}-${row.phaseNumber}`}
                row={row}
              />
            ))}
            {quests.length > QUEST_LIMIT ? (
              <li className="text-[0.7rem] text-muted-foreground">
                +{quests.length - QUEST_LIMIT} more quest requirements
              </li>
            ) : null}
          </Subsection>
        ) : null}
      </div>
    </section>
  )
}
