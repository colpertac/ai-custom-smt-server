import type { Metadata } from "next"
import Link from "next/link"

import { countWikiItems, countWikiCatalog } from "@/content/wiki"
import { WikiSearch } from "@/features/wiki/components/WikiSearch"
import { WikiPageHeader } from "@/features/wiki/components/WikiShell"
import { WIKI_CATEGORY_META } from "@/features/wiki/wiki-nav"

export const metadata: Metadata = {
  title: "Item wiki",
}

export default function WikiIndexPage() {
  const total = countWikiCatalog()

  return (
    <div className="space-y-10">
      <WikiPageHeader
        title="Item wiki"
        description={`Browse ${total.toLocaleString()} items from game BinaryData — gear stats, slots, and descriptions. Shop prices on the COMP are separate.`}
      />

      <div className="border-2 border-border bg-card/60 p-5">
        <WikiSearch size="lg" autoFocus />
      </div>

      <section>
        <h2 className="font-heading text-sm font-semibold tracking-[0.14em] uppercase text-gold-dim">
          How to use this wiki
        </h2>
        <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Search</span> by item
            name or numeric ID — e.g. &quot;Ointment&quot; or &quot;1201&quot;.
          </li>
          <li>
            <span className="font-medium text-foreground">Browse</span> a
            category below when you want to explore weapons, armor, or
            consumables.
          </li>
          <li>
            <span className="font-medium text-foreground">Open a row</span> for
            full stats, gender lock, stack size, and NPC buy/sell values.
          </li>
        </ol>
      </section>

      <section>
        <h2 className="font-heading text-sm font-semibold tracking-[0.14em] uppercase text-gold-dim">
          Categories
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {(
            Object.keys(WIKI_CATEGORY_META) as Array<
              keyof typeof WIKI_CATEGORY_META
            >
          ).map((key) => {
            const card = WIKI_CATEGORY_META[key]
            const n = countWikiItems(key)
            return (
              <li key={card.href}>
                <Link
                  href={card.href}
                  className="group flex h-full flex-col border border-border bg-muted/40 p-4 no-underline transition-colors hover:border-gold-dim hover:bg-card/60"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-heading text-lg font-semibold tracking-wide text-foreground group-hover:text-gold-hot">
                      {card.title}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {n.toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {card.blurb}
                  </p>
                  <span className="mt-4 text-xs uppercase tracking-wider text-gold-dim group-hover:text-gold-hot">
                    Browse →
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
