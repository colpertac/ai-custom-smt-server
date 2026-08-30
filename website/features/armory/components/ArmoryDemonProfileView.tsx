import Link from "next/link"

import { ArmoryHero } from "@/features/armory/components/ArmoryHero"
import type { ArmoryDemonDetail, ArmoryDemonGear } from "@/lib/armory-demons"
import { cn } from "@/lib/utils"

function EquipPanel({
  slot,
  align,
}: {
  slot: ArmoryDemonGear
  align: "left" | "right"
}) {
  const empty = slot.itemType == null
  const enchants: string[] = []
  if (slot.tarot) enchants.push(`Tarot ${slot.tarot}`)
  if (slot.soul) enchants.push(`Soul ${slot.soul}`)
  if (slot.basicEffect) enchants.push(`Basic ${slot.basicEffect}`)
  if (slot.specialEffect) enchants.push(`Special ${slot.specialEffect}`)
  if (slot.modSlots.length) {
    enchants.push(`Mods ${slot.modSlots.join("/")}`)
  }

  const body = (
    <>
      <span
        className="inline-block size-9 shrink-0 border border-border bg-muted/50"
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] tracking-wide text-muted-foreground uppercase">
          {slot.label}
        </span>
        {empty ? (
          <span className="block truncate text-xs text-muted-foreground/70">
            Empty
          </span>
        ) : (
          <>
            <span className="block truncate text-sm text-[#c9a0ff]">
              {slot.name}
            </span>
            {enchants.length ? (
              <span className="block text-[11px] text-[#7dcea0]">
                {enchants.join(" · ")}
              </span>
            ) : (
              <span className="block text-[11px] text-muted-foreground">
                No crystal / mods
              </span>
            )}
          </>
        )}
      </span>
    </>
  )

  const rowClass = cn(
    "flex items-center gap-2 border border-border/80 bg-background/40 px-2 py-1.5",
    empty && "opacity-45",
    align === "right" && "flex-row-reverse text-right"
  )

  if (!empty && slot.itemType != null) {
    return (
      <Link
        href={`/wiki/items/${slot.itemType}`}
        className={cn(rowClass, "no-underline hover:border-gold-dim")}
      >
        {body}
      </Link>
    )
  }
  return <div className={rowClass}>{body}</div>
}

function StatStrip({
  stats,
}: {
  stats: NonNullable<ArmoryDemonDetail["stats"]>
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs">
        <span className="font-medium text-[#4ade80]">
          HP {stats.hp}/{stats.maxHp}
        </span>
        <span className="text-muted-foreground"> · </span>
        <span className="font-medium text-[#38bdf8]">
          MP {stats.mp}/{stats.maxMp}
        </span>
      </p>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs tracking-wide uppercase">
        {(
          [
            ["STR", stats.str],
            ["MAG", stats.magic],
            ["VIT", stats.vit],
            ["INT", stats.intel],
            ["SPD", stats.speed],
            ["LUK", stats.luck],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex gap-1.5">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs tracking-wide uppercase">
        {(
          [
            ["CLSR", stats.clsr],
            ["LNGR", stats.lngr],
            ["SPELL", stats.spell],
            ["SUPP", stats.support],
            ["PDEF", stats.pdef],
            ["MDEF", stats.mdef],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex gap-1.5">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function ArmoryDemonProfileView({
  demon,
}: {
  demon: ArmoryDemonDetail
}) {
  const left = demon.equipment.slice(0, 2)
  const right = demon.equipment.slice(2, 4)
  const mitamaGroups = Array.from({ length: 12 }, (_, g) => {
    const ranks = demon.mitamaReunion.slice(g * 8, g * 8 + 8)
    return ranks.reduce((a, b) => a + b, 0)
  })
  const hasMitamaBonus = mitamaGroups.some((v) => v > 0)
  const forceNonZero = demon.forceValues
    .map((v, i) => ({ i, v }))
    .filter((x) => x.v !== 0)
  const stackNonZero = demon.forceStack
    .map((v, i) => ({ i, v }))
    .filter((x) => x.v !== 0)

  return (
    <div className="space-y-4">
      <header className="border-2 border-border bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-heading text-3xl font-semibold tracking-[0.1em] text-[#e8ecf4] uppercase">
            {demon.name}
          </h1>
          {demon.stats ? (
            <span className="text-sm text-gold-dim">
              Lv {demon.stats.level}
            </span>
          ) : null}
          {demon.active ? (
            <span className="text-xs text-gold-hot">Active summon</span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Type {demon.type}
          {` · Fam ${demon.familiarity}`}
          {` · Growth ${demon.growthType}`}
          {demon.mitamaRank > 0
            ? ` · Mitama rank ${demon.mitamaRank} (type ${demon.mitamaType})`
            : ""}
          {demon.locked ? " · Locked" : ""}
          {demon.ownerCharacter
            ? ` · On ${demon.ownerCharacter}`
            : demon.location === "account_storage"
              ? " · Account storage"
              : ""}
        </p>
        {demon.stats ? (
          <div className="mt-3">
            <StatStrip stats={demon.stats} />
          </div>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          Reunion total{" "}
          <span className="font-medium text-foreground">
            {demon.reunionTotal}
          </span>
          {` · Soul points ${demon.soulPoints}`}
          {demon.magReduction
            ? ` · Mag reduction ${demon.magReduction}%`
            : ""}
        </p>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(12rem,0.9fr)_minmax(14rem,1.2fr)_minmax(12rem,0.9fr)]">
        <div className="flex flex-col gap-1.5">
          {left.map((s) => (
            <EquipPanel key={s.slot} slot={s} align="left" />
          ))}
        </div>

        <ArmoryHero
          name={demon.name}
          className="order-first min-h-[18rem] lg:order-none"
        />

        <div className="flex flex-col gap-1.5">
          {right.map((s) => (
            <EquipPanel key={s.slot} slot={s} align="right" />
          ))}
        </div>
      </div>

      <section className="border-2 border-border bg-card/50 p-4">
        <h2 className="font-heading text-sm font-semibold tracking-wide uppercase">
          Reunion ranks
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Twelve growth-group ranks (capped at 8 each for the total above).
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-12">
          {demon.reunion.map((rank, i) => (
            <div
              key={i}
              className={cn(
                "border border-border px-1 py-2 text-center",
                rank > 0 ? "bg-muted/60" : "opacity-40"
              )}
            >
              <div className="text-[10px] text-muted-foreground">G{i + 1}</div>
              <div className="font-medium">{rank}</div>
            </div>
          ))}
        </div>
      </section>

      {hasMitamaBonus ? (
        <section className="border-2 border-border bg-card/50 p-4">
          <h2 className="font-heading text-sm font-semibold tracking-wide uppercase">
            Mitama reunion
          </h2>
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-12">
            {mitamaGroups.map((sum, i) => (
              <div
                key={i}
                className={cn(
                  "border border-border px-1 py-2 text-center",
                  sum > 0 ? "bg-muted/60" : "opacity-40"
                )}
              >
                <div className="text-[10px] text-muted-foreground">M{i + 1}</div>
                <div className="font-medium">{sum}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {(forceNonZero.length > 0 || stackNonZero.length > 0) && (
        <section className="border-2 border-border bg-card/50 p-4">
          <h2 className="font-heading text-sm font-semibold tracking-wide uppercase">
            Force
          </h2>
          {forceNonZero.length > 0 ? (
            <p className="mt-2 text-xs">
              Values:{" "}
              {forceNonZero.map(({ i, v }) => `#${i}=${v}`).join(", ")}
            </p>
          ) : null}
          {stackNonZero.length > 0 ? (
            <p className="mt-1 text-xs">
              Stack:{" "}
              {stackNonZero.map(({ i, v }) => `#${i}=${v}`).join(", ")}
            </p>
          ) : null}
        </section>
      )}

      {demon.skills.length > 0 ? (
        <section className="border-2 border-border bg-card/50 p-4">
          <h2 className="font-heading text-sm font-semibold tracking-wide uppercase">
            Learned skills
          </h2>
          <p className="mt-2 text-xs text-foreground/90">
            {demon.skills.map((id) => `#${id}`).join(", ")}
          </p>
        </section>
      ) : null}

      {demon.inheritedSkills.length > 0 ? (
        <section className="border-2 border-border bg-card/50 p-4">
          <h2 className="font-heading text-sm font-semibold tracking-wide uppercase">
            Inherited skills
          </h2>
          <ul className="mt-2 space-y-1 text-xs">
            {demon.inheritedSkills.map((s) => (
              <li key={`${s.skillId}-${s.progress}`}>
                #{s.skillId}
                <span className="ml-2 text-muted-foreground">
                  progress {s.progress}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
