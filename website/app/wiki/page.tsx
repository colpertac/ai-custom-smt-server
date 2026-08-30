import type { Metadata } from "next"
import Link from "next/link"

import { countWikiItems } from "@/content/wiki"

export const metadata: Metadata = {
  title: "Item DB",
}

const CARDS = [
  {
    href: "/wiki/weapons",
    title: "Weapons",
    category: "weapons" as const,
    blurb: "Swords, guns, and other Weapon-slot arms.",
  },
  {
    href: "/wiki/armor",
    title: "Armor",
    category: "armor" as const,
    blurb: "Head, body, feet, accessories, COMP, and other wearable slots.",
  },
  {
    href: "/wiki/items",
    title: "Items",
    category: "items" as const,
    blurb: "Consumables and anything that is not equipped.",
  },
]

export default function WikiIndexPage() {
  return (
    <section className="mx-auto max-w-2xl">
      <h1 className="font-heading text-3xl font-semibold tracking-[0.12em] uppercase">
        Item DB
      </h1>
      <div className="gold-rule mt-3 max-w-xs" />
      <p className="mt-4 text-sm text-muted-foreground">
        Lookup gear and items by BinaryData definitions — stats and slots, not
        shop prices.
      </p>
      <ul className="mt-8 space-y-3">
        {CARDS.map((card) => {
          const n = countWikiItems(card.category)
          return (
            <li key={card.href}>
              <Link
                href={card.href}
                className="group block border border-border bg-muted/40 p-4 no-underline outline-none transition-colors hover:border-gold-dim"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-heading text-xl font-semibold tracking-wide text-foreground group-hover:text-gold-hot">
                    {card.title}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {n} sample{n === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{card.blurb}</p>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
