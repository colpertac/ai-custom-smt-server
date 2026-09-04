import Link from "next/link"

import {
  getWikiItemCategory,
  wikiBasicFeatures,
  wikiCatalog,
  wikiCharacteristics,
  wikiItemSoulFusion,
  wikiItemTarotFusion,
  wikiItemCompShops,
  wikiSetBonus,
  type WikiItem,
} from "@/content/wiki"
import { WikiGenderBadge } from "@/features/wiki/components/WikiGenderBadge"
import { WikiEquipmentSetsBox } from "@/features/wiki/components/WikiEquipmentSetsBox"
import { WikiFeatureBox } from "@/features/wiki/components/WikiFeatureBox"
import { WikiCompShopSources } from "@/features/wiki/components/WikiCompShopSources"
import { WikiFusionBox } from "@/features/wiki/components/WikiFusionBox"
import { WikiItemIcon } from "@/features/wiki/components/WikiItemIcon"
import { WikiBreadcrumb } from "@/features/wiki/components/WikiShell"
import { WIKI_CATEGORY_META } from "@/features/wiki/wiki-nav"
import { equipmentSetMembership } from "@/lib/gear-planner-combat"

export function WikiItemDetailView({ item }: { item: WikiItem }) {
  const category = getWikiItemCategory(item)
  const meta = WIKI_CATEGORY_META[category]
  const setBonus = wikiSetBonus(item)
  const basicFeatures = wikiBasicFeatures(item)
  const characteristics = wikiCharacteristics(item)
  const tarotFusion = wikiItemTarotFusion(item)
  const soulFusion = wikiItemSoulFusion(item)
  const compShops = wikiItemCompShops(item.id)
  const equipmentSets = equipmentSetMembership(item.id)

  return (
    <div className="space-y-3">
      <WikiBreadcrumb
        segments={[
          { label: "Item wiki", href: "/wiki" },
          { label: meta.title, href: meta.href },
          { label: String(item.id) },
        ]}
      />

      <article className="border border-border bg-card/40">
        <header className="flex items-start gap-3 border-b border-border px-3 py-2.5 sm:px-4">
          <WikiItemIcon item={item} size={56} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-xl tracking-wide uppercase leading-tight">
              {item.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              <span className="font-mono text-xs">#{item.id}</span>
              <span aria-hidden>·</span>
              <span>{item.equipSlot}</span>
              {item.weaponType && item.weaponType !== "NONE" ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{item.weaponType}</span>
                </>
              ) : null}
              {category === "armor" ? (
                <>
                  <span aria-hidden>·</span>
                  <WikiGenderBadge
                    gender={item.gender}
                    label={item.genderLabel}
                  />
                </>
              ) : null}
              {item.level > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span>Lv {item.level}</span>
                </>
              ) : null}
            </p>
          </div>
        </header>

        <div className="grid gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-4">
          <div className="min-w-0 space-y-3">
            <section>
              <h2 className="font-heading text-xs font-semibold tracking-[0.12em] uppercase text-gold-dim">
                Description
              </h2>
              <p className="mt-1.5 text-sm leading-snug text-foreground/90">
                {item.description || "No in-game description on record."}
              </p>
            </section>

            <div className="grid gap-3 lg:grid-cols-2">
              <WikiFeatureBox
                title="Set bonus"
                tag="S1"
                hint="This piece alone / transfers as S1 when fused."
                lines={setBonus}
              />
              <WikiEquipmentSetsBox sets={equipmentSets} />
              <WikiFeatureBox
                title="Basic features"
                tag="S2"
                hint="Core combat stats from game data."
                stats={basicFeatures}
              />
              <WikiFeatureBox
                title="Characteristics"
                tag="S3"
                hint="Rate bonuses, cooldown, and trait modifiers."
                stats={characteristics}
              />
              {tarotFusion ? (
                <WikiFusionBox
                  title="Tarot fusion"
                  fusion={tarotFusion}
                  empty=""
                />
              ) : null}
              {soulFusion ? (
                <WikiFusionBox
                  title="Soul fusion"
                  fusion={soulFusion}
                  empty=""
                />
              ) : null}
              <div className="lg:col-span-2">
                <WikiCompShopSources listings={compShops} />
              </div>
            </div>
          </div>

          <aside className="space-y-2 xl:order-none">
            <MetaPanel title="Details">
              <MetaRow label="Category">
                <Link
                  href={meta.href}
                  className="text-gold-dim no-underline hover:text-gold-hot"
                >
                  {meta.title}
                </Link>
              </MetaRow>
              <MetaRow label="Item ID">
                <span className="font-mono">{item.id}</span>
              </MetaRow>
              <MetaRow label="Icon ID">
                <span className="font-mono">{item.icon}</span>
              </MetaRow>
              {item.iconAsset ? (
                <MetaRow label="Icon asset">
                  <span className="font-mono text-xs">{item.iconAsset}</span>
                </MetaRow>
              ) : null}
              <MetaRow label="Stack size">
                {item.stackSize.toLocaleString()}
              </MetaRow>
              <MetaRow label="Durability">
                {item.durability.toLocaleString()}
              </MetaRow>
              {category === "armor" ? (
                <MetaRow label="Gender">
                  <WikiGenderBadge
                    gender={item.gender}
                    label={item.genderLabel}
                  />
                </MetaRow>
              ) : null}
            </MetaPanel>

            <MetaPanel title="Shop values">
              <p className="mb-2 text-[0.7rem] leading-snug text-muted-foreground">
                Default NPC buy/sell from the client — not live shop prices.
              </p>
              <MetaRow label="Buy">
                {item.buyPrice > 0
                  ? `${item.buyPrice.toLocaleString()} Macca`
                  : "—"}
              </MetaRow>
              <MetaRow label="Sell">
                {item.sellPrice > 0
                  ? `${item.sellPrice.toLocaleString()} Macca`
                  : "—"}
              </MetaRow>
            </MetaPanel>
          </aside>
        </div>
      </article>

      <p className="text-xs text-muted-foreground">
        Item data exported from the game client
        {wikiCatalog.generatedAt
          ? ` · updated ${new Date(wikiCatalog.generatedAt).toLocaleDateString()}`
          : null}
      </p>
    </div>
  )
}

function MetaPanel({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="border border-border bg-muted/30 px-2.5 py-2">
      <h3 className="font-heading text-[0.65rem] font-semibold tracking-[0.14em] uppercase text-muted-foreground">
        {title}
      </h3>
      <dl className="mt-2 space-y-1.5 text-sm">{children}</dl>
    </div>
  )
}

function MetaRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}
