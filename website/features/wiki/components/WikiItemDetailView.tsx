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
import { WikiFeatureBox } from "@/features/wiki/components/WikiFeatureBox"
import { WikiCompShopSources } from "@/features/wiki/components/WikiCompShopSources"
import { WikiFusionBox } from "@/features/wiki/components/WikiFusionBox"
import { WikiItemIcon } from "@/features/wiki/components/WikiItemIcon"
import { WikiBreadcrumb } from "@/features/wiki/components/WikiShell"
import { WIKI_CATEGORY_META } from "@/features/wiki/wiki-nav"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function WikiItemDetailView({ item }: { item: WikiItem }) {
  const category = getWikiItemCategory(item)
  const meta = WIKI_CATEGORY_META[category]
  const setBonus = wikiSetBonus(item)
  const basicFeatures = wikiBasicFeatures(item)
  const characteristics = wikiCharacteristics(item)
  const tarotFusion = wikiItemTarotFusion(item)
  const soulFusion = wikiItemSoulFusion(item)
  const compShops = wikiItemCompShops(item.id)

  return (
    <div className="space-y-6">
      <WikiBreadcrumb
        segments={[
          { label: "Item wiki", href: "/wiki" },
          { label: meta.title, href: meta.href },
          { label: String(item.id) },
        ]}
      />

      <Card className="border-2 bg-card/70">
        <CardHeader className="border-b border-border">
          <div className="flex items-start gap-4">
            <WikiItemIcon item={item} size={80} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <CardTitle className="font-heading text-2xl tracking-wide uppercase">
                {item.name}
              </CardTitle>
              <CardDescription className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  #{item.id}
                </span>
                <span>·</span>
                <span>{item.equipSlot}</span>
                {item.weaponType && item.weaponType !== "NONE" ? (
                  <>
                    <span>·</span>
                    <span>{item.weaponType}</span>
                  </>
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
                {item.level > 0 ? (
                  <>
                    <span>·</span>
                    <span>Lv {item.level}</span>
                  </>
                ) : null}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="grid gap-6 pt-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="space-y-6">
            <section>
              <h2 className="font-heading text-sm font-semibold tracking-[0.12em] uppercase text-gold-dim">
                Description
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                {item.description || "No in-game description on record."}
              </p>
            </section>

            <div className="space-y-4">
              <WikiFeatureBox
                title="Set bonus"
                tag="S1"
                hint="Appearance / set bonus — what this item contributes when fused onto another piece."
                lines={setBonus}
                empty="No set bonus defined for this base item."
              />
              <WikiFeatureBox
                title="Basic features"
                tag="S2"
                hint="Core combat stats from this item's BinaryData row."
                stats={basicFeatures}
                empty="No basic feature stats — typical for consumables and non-equip items."
              />
              <WikiFeatureBox
                title="Characteristics"
                tag="S3"
                hint="Rate bonuses, cooldown tweaks, and other trait-style modifiers."
                stats={characteristics}
                empty="No characteristics on this base item."
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
              <WikiCompShopSources listings={compShops} />
            </div>
          </div>

          <aside className="space-y-4">
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
              <p className="mb-3 text-xs text-muted-foreground">
                Base buy/sell from BinaryData — not live COMP shop prices.
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
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Data from {wikiCatalog.source}
        {wikiCatalog.iconsSource ? ` · Icons: ${wikiCatalog.iconsSource}` : null}
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
    <div className="border border-border bg-muted/30 p-3">
      <h3 className="font-heading text-xs font-semibold tracking-[0.14em] uppercase text-muted-foreground">
        {title}
      </h3>
      <dl className="mt-3 space-y-2.5 text-sm">{children}</dl>
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
