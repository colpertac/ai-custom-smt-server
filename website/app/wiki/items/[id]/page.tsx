import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  getWikiItem,
  getWikiItemCategory,
  listWikiItems,
  wikiItemsSample,
} from "@/content/wiki"
import { WikiGenderBadge } from "@/features/wiki/components/WikiGenderBadge"
import { WikiItemIcon } from "@/features/wiki/components/WikiItemIcon"

type Props = { params: Promise<{ id: string }> }

const CATEGORY_HREF = {
  weapons: "/wiki/weapons",
  armor: "/wiki/armor",
  items: "/wiki/items",
} as const

const CATEGORY_LABEL = {
  weapons: "Weapons",
  armor: "Armor",
  items: "Items",
} as const

export async function generateStaticParams() {
  return listWikiItems().map((item) => ({ id: String(item.id) }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const item = getWikiItem(Number(id))
  return { title: item ? `${item.name} — Item DB` : "Item — Item DB" }
}

export default async function WikiItemPage({ params }: Props) {
  const { id } = await params
  const item = getWikiItem(Number(id))
  if (!item) notFound()

  const category = getWikiItemCategory(item)

  return (
    <section className="mx-auto max-w-2xl">
      <p className="text-xs tracking-wide text-muted-foreground">
        <Link href="/wiki" className="hover:text-gold-dim">
          Item DB
        </Link>
        <span className="mx-2 text-border">/</span>
        <Link href={CATEGORY_HREF[category]} className="hover:text-gold-dim">
          {CATEGORY_LABEL[category]}
        </Link>
        <span className="mx-2 text-border">/</span>
        {item.id}
      </p>

      <div className="mt-4 flex items-start gap-4">
        <WikiItemIcon item={item} size={64} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-3xl font-semibold tracking-wide">
            {item.name}
          </h1>
          <div className="gold-rule mt-3 max-w-xs" />
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{item.equipSlot}</span>
            {item.weaponType && item.weaponType !== "NONE" ? (
              <span>· {item.weaponType}</span>
            ) : null}
            {category === "armor" ? (
              <>
                <span>·</span>
                <WikiGenderBadge
                  gender={item.gender}
                  label={item.genderLabel}
                />
              </>
            ) : null}
            {item.level > 0 ? <span>· Lv {item.level}</span> : null}
          </p>
        </div>
      </div>

      <h2 className="font-heading mt-8 text-lg font-semibold tracking-wide uppercase">
        Stats
      </h2>
      {item.stats.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No equipment stats (typical for consumables / non-equip).
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border border border-border">
          {item.stats.map((stat) => (
            <li
              key={`${stat.id}-${stat.type}`}
              className="flex items-center justify-between px-3 py-2.5 text-sm"
            >
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="font-mono text-base font-semibold text-gold-hot">
                {stat.value > 0 ? `+${stat.value}` : stat.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-8 text-sm leading-relaxed text-muted-foreground">
        {item.description || "No description."}
      </p>

      <dl className="mt-8 grid gap-3 border-t border-border pt-6 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Item ID</dt>
          <dd className="font-mono font-medium">{item.id}</dd>
        </div>
        {category === "armor" ? (
          <div>
            <dt className="text-xs text-muted-foreground">Gender</dt>
            <dd className="mt-1">
              <WikiGenderBadge
                gender={item.gender}
                label={item.genderLabel}
              />
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs text-muted-foreground">Durability / stack</dt>
          <dd className="font-medium">
            {item.durability} / {item.stackSize}
          </dd>
        </div>
      </dl>

      <p className="mt-10 text-xs text-muted-foreground">
        Source: {wikiItemsSample.source}
        {wikiItemsSample.iconsSource
          ? ` · Icons: ${wikiItemsSample.iconsSource}`
          : null}
      </p>
    </section>
  )
}
