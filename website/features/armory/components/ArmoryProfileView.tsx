import Image from "next/image"
import Link from "next/link"

import { ArmoryEquipSlot } from "@/features/armory/components/ArmoryEquipSlot"
import { ArmoryHero } from "@/features/armory/components/ArmoryHero"
import { ArmoryLncGauge } from "@/features/armory/components/ArmoryLncGauge"
import { CombatBonusesStrip } from "@/features/armory/components/CombatBonusesStrip"
import { DemonBoostIndicator } from "@/features/armory/components/DemonBoostIndicator"
import type {
  ArmoryEquipmentSlot,
  ArmoryExpertise,
  ArmoryProfile,
  ArmoryStats,
} from "@/lib/armory"
import type { ArmoryComputedStats } from "@/lib/armory-stats"
import { cn } from "@/lib/utils"

const LEFT_SLOTS = new Set([
  "head",
  "face",
  "neck",
  "top",
  "arms",
  "bottom",
  "feet",
])

const RIGHT_SLOTS = new Set([
  "comp",
  "ring",
  "earring",
  "extra",
  "back",
  "talisman",
  "weapon",
  "bullets",
])

function GenderIcon({ gender }: { gender: number }) {
  if (gender === 0) {
    return (
      <span
        className="inline-flex size-5 items-center justify-center text-base font-semibold text-[#5eb0ff]"
        title="Male"
        aria-label="Male"
      >
        ♂
      </span>
    )
  }
  if (gender === 1) {
    return (
      <span
        className="inline-flex size-5 items-center justify-center text-base font-semibold text-[#ff7eb3]"
        title="Female"
        aria-label="Female"
      >
        ♀
      </span>
    )
  }
  return (
    <span className="text-xs text-muted-foreground" title={`Gender ${gender}`}>
      ?
    </span>
  )
}

function StatValue({
  label,
  base,
  total,
  bonus,
}: {
  label: string
  base: number
  total?: number
  bonus?: number
}) {
  const showTotal = total != null && bonus != null && bonus !== 0
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums text-foreground">
        {showTotal ? (
          <>
            <span>{total}</span>
            <span className="ml-1.5 font-normal normal-case text-muted-foreground">
              ({base}
              <span className="text-[#4ade80]">
                {" "}
                +{bonus}
              </span>
              )
            </span>
          </>
        ) : (
          <>
            {base}
            <span className="ml-1 font-normal normal-case text-muted-foreground">
              (base)
            </span>
          </>
        )}
      </dd>
    </div>
  )
}

function StatStrip({
  stats,
  computed,
  profile,
}: {
  stats: ArmoryStats
  computed: ArmoryComputedStats | null
  profile: ArmoryProfile
}) {
  const primary = [
    ["STR", "str"],
    ["MAG", "magic"],
    ["VIT", "vit"],
    ["INT", "intel"],
    ["SPD", "speed"],
    ["LUK", "luck"],
  ] as const
  const combat = [
    ["CLSR", "clsr"],
    ["LNGR", "lngr"],
    ["SPELL", "spell"],
    ["SUPP", "support"],
    ["PDEF", "pdef"],
    ["MDEF", "mdef"],
  ] as const

  const total = computed?.total
  const bonus = computed?.bonus

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-xs">
          <span className="font-medium text-[#4ade80]">
            HP {(total?.hp ?? stats.hp)}/{(total?.maxHp ?? stats.maxHp)}
          </span>
          <span className="text-muted-foreground"> · </span>
          <span className="font-medium text-[#38bdf8]">
            MP {(total?.mp ?? stats.mp)}/{(total?.maxMp ?? stats.maxMp)}
          </span>
          {stats.xp > 0 ? (
            <span className="text-muted-foreground">{` · XP ${stats.xp}`}</span>
          ) : null}
        </p>
        <DemonBoostIndicator summoned={profile.demonSummoned} />
      </div>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        {profile.statsSource === "live" ? (
          <>
            Live stats while this character is online in-game
            {profile.statsDigitalized ? " (digitalized)" : ""}. Snapshot at{" "}
            {profile.statsFetchedAt
              ? new Date(profile.statsFetchedAt).toLocaleString()
              : "now"}
            — numbers can change if gear or buffs changed since then.
          </>
        ) : (
          <>
            Estimated from saved character data and gear. Buffs, some bonuses,
            and exact summon state may differ until they log in again.
          </>
        )}
      </p>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs tracking-wide uppercase">
        {primary.map(([label, key]) => (
          <StatValue
            key={label}
            label={label}
            base={stats[key]}
            total={total?.[key]}
            bonus={bonus?.[key]}
          />
        ))}
      </dl>
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs tracking-wide uppercase">
        {combat.map(([label, key]) => (
          <StatValue
            key={label}
            label={label}
            base={stats[key]}
            total={total?.[key]}
            bonus={bonus?.[key]}
          />
        ))}
      </dl>
    </div>
  )
}

export function ArmoryProfileView({ profile }: { profile: ArmoryProfile }) {
  const left = profile.equipment.filter((s) => LEFT_SLOTS.has(s.slot))
  const right = profile.equipment.filter((s) => RIGHT_SLOTS.has(s.slot))
  const level = profile.stats?.level

  return (
    <div className="space-y-4">
      <header className="border-2 border-border bg-muted/20 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-heading text-3xl font-semibold tracking-[0.1em] text-[#e8ecf4] uppercase">
            {profile.name}
          </h1>
          <GenderIcon gender={profile.appearance.gender} />
          {level != null ? (
            <span className="text-sm text-gold-dim">Lv {level}</span>
          ) : null}
          {profile.clan ? (
            <span className="text-sm text-muted-foreground">
              &lt;{profile.clan.name}&gt;
              {profile.clan.level > 0 ? ` · Clan Lv ${profile.clan.level}` : ""}
            </span>
          ) : null}
        </div>
        {profile.title > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Title #{profile.title}
          </p>
        ) : null}
        <ArmoryLncGauge lnc={profile.lnc} className="mt-3" />
        {profile.activeDemon && profile.demonSummoned ? (
          <p className="mt-2 text-sm">
            Summoned partner:{" "}
            {profile.activeDemon.id ? (
              <Link
                href={`/armory/demon/${encodeURIComponent(profile.activeDemon.id)}`}
                className="text-gold-dim hover:text-gold-hot"
              >
                {profile.activeDemon.name}
                {profile.activeDemon.level != null
                  ? ` (Lv ${profile.activeDemon.level})`
                  : ""}
              </Link>
            ) : (
              <span className="text-gold-dim">
                {profile.activeDemon.name}
                {profile.activeDemon.level != null
                  ? ` (Lv ${profile.activeDemon.level})`
                  : ""}
              </span>
            )}
          </p>
        ) : profile.statsSource === "live" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Partner demon not summoned — stats shown without summon bonuses.
          </p>
        ) : profile.activeDemon ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Partner assigned to this character (
            {profile.activeDemon.name}
            {profile.activeDemon.level != null
              ? ` Lv ${profile.activeDemon.level}`
              : ""}
            ) — whether they are summoned is unknown while offline.
          </p>
        ) : null}
        {profile.stats ? (
          <div className="mt-3 space-y-3">
            <StatStrip
              stats={profile.stats}
              computed={profile.computedStats}
              profile={profile}
            />
            <CombatBonusesStrip
              bonuses={profile.combatBonuses ?? null}
              live={profile.statsSource === "live"}
            />
          </div>
        ) : null}
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(12rem,0.9fr)_minmax(14rem,1.2fr)_minmax(12rem,0.9fr)]">
        <div className="flex flex-col gap-1.5">
          {left.map((s) => (
            <ArmoryEquipSlot key={s.slot} slot={s} align="left" />
          ))}
        </div>

        <ArmoryHero
          name={profile.name}
          portraitUrl={profile.portraitUrl}
          className="order-first lg:order-none"
        />

        <div className="flex flex-col gap-1.5">
          {right.map((s) => (
            <ArmoryEquipSlot key={s.slot} slot={s} align="right" />
          ))}
        </div>
      </div>

      <section className="border-2 border-border bg-card/50 p-4">
        <h2 className="font-heading text-sm font-semibold tracking-wide uppercase">
          Expertises
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every 100 points is a rank; every 1000 is a class. Chain expertises
          are calculated from standard ones (same formulas as in-game).
        </p>
        {profile.expertises.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">None recorded.</p>
        ) : (
          <ExpertiseGroups expertises={profile.expertises} />
        )}
      </section>
    </div>
  )
}

function ExpertiseGroups({ expertises }: { expertises: ArmoryExpertise[] }) {
  const normal = expertises.filter((e) => !e.isChain && e.implemented)
  const chain = expertises.filter((e) => e.isChain && e.implemented)
  const unavailable = expertises.filter((e) => !e.implemented)

  return (
    <div className="mt-3 space-y-5">
      <ExpertiseGroup title="Standard" items={normal} />
      <ExpertiseGroup title="Chain" items={chain} />
      {unavailable.length > 0 && (
        <ExpertiseGroup
          title="Not implemented"
          hint="Never fully shipped (max class 0) — cannot be leveled in-game."
          items={unavailable}
        />
      )}
    </div>
  )
}

function ExpertiseGroup({
  title,
  hint,
  items,
}: {
  title: string
  hint?: string
  items: ArmoryExpertise[]
}) {
  if (items.length === 0) {
    return (
      <div>
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          {title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">None on this character.</p>
      </div>
    )
  }

  return (
    <div>
      <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {title}
      </h3>
      {hint && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      )}
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((e) => (
          <ExpertiseRow key={e.id} expertise={e} />
        ))}
      </div>
    </div>
  )
}

function ExpertiseRow({ expertise: e }: { expertise: ArmoryExpertise }) {
  return (
    <div
      className={cn(
        "border border-border/80 px-2.5 py-2 text-xs",
        (e.disabled || !e.implemented) && "opacity-50"
      )}
      title={`${e.displayPoints} pts · max class ${e.maxClass}${
        e.maxRank ? ` rank ${e.maxRank}` : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {e.iconSrc ? (
            <Image
              src={e.iconSrc}
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0 border border-border/60 bg-muted object-cover"
              unoptimized
            />
          ) : (
            <span
              aria-hidden
              className="size-7 shrink-0 border border-border/60 bg-muted"
            />
          )}
          <span className="min-w-0 font-medium text-foreground">
            {e.name}
            {e.disabled ? " (off)" : ""}
            {!e.implemented ? (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                (n/a)
              </span>
            ) : null}
          </span>
        </div>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {!e.implemented ? (
            <>n/a</>
          ) : e.atMax ? (
            <>
              Max C{e.maxClass}
              {e.maxRank > 0 ? ` R${e.maxRank}` : ""}
            </>
          ) : (
            <>
              C{e.classLevel} R{e.rank}
            </>
          )}
        </span>
      </div>
      {e.implemented ? (
        <>
          <div
            className="mt-1.5 h-1.5 overflow-hidden bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(e.classProgress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${e.name} class progress`}
          >
            <div
              className={cn(
                "h-full transition-[width]",
                e.atMax ? "bg-gold-hot" : "bg-gold"
              )}
              style={{
                width: `${Math.round(e.classProgress * 1000) / 10}%`,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>
              {Math.round(e.classProgress * 100)}% to{" "}
              {e.atMax
                ? "cap"
                : e.classLevel >= e.maxClass
                  ? `R${e.maxRank}`
                  : `C${e.classLevel + 1}`}
            </span>
            <span>
              max C{e.maxClass}
              {e.maxRank > 0 ? `.${e.maxRank}` : ""}
            </span>
          </div>
        </>
      ) : (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Cannot be leveled (not implemented).
        </p>
      )}
    </div>
  )
}
