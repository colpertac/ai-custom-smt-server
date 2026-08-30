import Link from "next/link"

import type { ArmoryDemon, ArmoryDemonsPayload } from "@/lib/armory-demons"
import { cn } from "@/lib/utils"

function DemonCard({ demon }: { demon: ArmoryDemon }) {
  const gear = demon.equipment.filter((g) => g.itemType != null)
  const href = `/armory/demon/${encodeURIComponent(demon.id)}`
  return (
    <Link
      href={href}
      className={cn(
        "block border-2 border-border bg-card/70 p-3 no-underline transition-colors hover:border-gold-dim",
        demon.active && "border-gold-dim"
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-heading text-base font-semibold tracking-wide text-foreground">
          {demon.name}
          {demon.active ? (
            <span className="ml-2 text-xs font-normal text-gold-hot normal-case">
              Active
            </span>
          ) : null}
        </h3>
        <span className="text-xs text-muted-foreground">
          Slot {demon.boxSlot}
          {demon.locked ? " · Locked" : ""}
        </span>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        Type {demon.type}
        {demon.stats ? ` · Lv ${demon.stats.level}` : ""}
        {` · Fam ${demon.familiarity}`}
        {demon.mitamaRank > 0 ? ` · Mitama ${demon.mitamaRank}` : ""}
        {` · Growth ${demon.growthType}`}
      </p>
      {demon.stats ? (
        <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tracking-wide uppercase text-foreground">
          {(
            [
              ["STR", demon.stats.str],
              ["MAG", demon.stats.magic],
              ["VIT", demon.stats.vit],
              ["INT", demon.stats.intel],
              ["SPD", demon.stats.speed],
              ["LUK", demon.stats.luck],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex gap-1">
              <dt className="text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {demon.skills.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Skills:{" "}
          <span className="text-foreground/90">
            {demon.skills.map((sid) => `#${sid}`).join(", ")}
          </span>
        </p>
      ) : null}
      {gear.length > 0 ? (
        <ul className="mt-2 space-y-0.5 text-xs text-[#c9a0ff]">
          {gear.map((g, i) => (
            <li key={`${g.itemType}-${i}`}>
              {g.name}
              {g.tarot || g.soul
                ? ` (${[g.tarot && `T${g.tarot}`, g.soul && `S${g.soul}`]
                    .filter(Boolean)
                    .join(" ")})`
                : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </Link>
  )
}

function DemonSection({
  title,
  blurb,
  demons,
}: {
  title: string
  blurb: string
  demons: ArmoryDemon[]
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-lg font-semibold tracking-wide uppercase">
          {title}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>
      </div>
      {demons.length === 0 ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {demons.map((d) => (
            <DemonCard key={d.id} demon={d} />
          ))}
        </div>
      )}
    </section>
  )
}

export function ArmoryDemonsView({ data }: { data: ArmoryDemonsPayload }) {
  return (
    <div className="space-y-10">
      <DemonSection
        title="COMP"
        blurb="Demons on this character right now (support / demon-main builds). Click a card for reunion and gear detail."
        demons={data.comp}
      />
      <DemonSection
        title="Account storage"
        blurb="Shared demon depot for this account — usable by alts. Login name is not shown."
        demons={data.accountStorage}
      />
    </div>
  )
}
