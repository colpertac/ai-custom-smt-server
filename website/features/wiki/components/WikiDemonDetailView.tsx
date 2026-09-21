import Image from "next/image"
import Link from "next/link"
import { Fragment, type ReactNode } from "react"

import type {
  DevilAlignment,
  DevilCatalogEntry,
  DevilResistKind,
} from "@/lib/armory-catalogs"
import {
  DEVIL_RESIST_ICON,
  DEVIL_RESIST_TITLE,
  devilResistKind,
} from "@/lib/armory-catalogs"
import {
  demonFusionSkillTiers,
  devilInheritanceAllowedCategories,
  formatDevilFamily,
} from "@/lib/devil-inheritance"
import { getSkill } from "@/lib/skill-catalog"
import { getGrowthTypeLabel } from "@/lib/growth-type-catalog"
import { WikiBreadcrumb } from "@/features/wiki/components/WikiShell"
import { cn } from "@/lib/utils"

const RACE_ALIGN_CLASS: Record<DevilAlignment, string> = {
  law: "text-sky-400",
  neutral: "text-emerald-400",
  chaos: "text-rose-400",
}

const RESIST_KIND_CLASS: Record<DevilResistKind, string> = {
  normal: "text-foreground/80",
  weak: "text-rose-400 font-semibold",
  resist: "text-cyan-300",
  null: "text-foreground font-semibold",
  repel: "text-cyan-300 font-semibold",
  drain: "text-emerald-400 font-semibold",
}

/** Classic Imagine affinity table: 3 phys + 3 mag per band. */
const AFFINITY_TABLE_BANDS: readonly (readonly string[])[] = [
  ["slash", "charge", "blunt", "gun", "pierce", "spread"],
  ["fire", "ice", "elec", "force", "expel", "death"],
  ["magicforce", "nerve", "mind", "almighty", "heal", "support"],
]

/** Bottom row: each affinity spans 2 of 6 columns. */
const AFFINITY_WIDE_ROW = ["word", "special", "suicide"] as const

const AFFINITY_ABBREV: Record<string, string> = {
  slash: "SLSH",
  charge: "THRU",
  blunt: "BLNT",
  gun: "PROJ",
  pierce: "PENE",
  spread: "SPRD",
  fire: "FIRE",
  ice: "ICE",
  elec: "ELEC",
  force: "FRCE",
  expel: "XPEL",
  death: "DETH",
  magicforce: "MYST",
  nerve: "NERV",
  mind: "MIND",
  almighty: "ALMT",
  heal: "CURE",
  support: "SUPP",
  word: "WRDS",
  special: "SPCL",
  suicide: "SUIC",
}

const CELL =
  "border border-[color:oklch(0.55_0.06_240_/_0.55)] px-1.5 py-1.5 text-center align-middle"

function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="border border-border bg-card/40">
      <h2 className="border-b border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  )
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 border-b border-border/60 py-1 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{value}</dd>
    </div>
  )
}

function SkillLink({ skillId }: { skillId: number }) {
  const skill = getSkill(skillId)
  const name = skill?.name ?? `Skill ${skillId}`
  return (
    <Link
      href={`/wiki/skills/${skillId}`}
      className="inline-flex items-center gap-1.5 text-foreground hover:text-gold-hot"
    >
      {skill?.iconSrc ? (
        <Image
          src={skill.iconSrc}
          alt=""
          width={20}
          height={20}
          className="size-5 object-contain"
          unoptimized
        />
      ) : (
        <span className="size-5 bg-muted/40" />
      )}
      <span>{name}</span>
      <span className="font-mono text-[10px] text-muted-foreground">
        #{skillId}
      </span>
    </Link>
  )
}

function formatResistDisplay(raw: string): string {
  const v = raw.trim()
  if (!v || v === "-" || v === "1" || v === "1.0" || v === "1.00") return "100%"
  if (v === "nu" || v === "n") return "Null"
  if (v === "rp" || v === "r") return "Repel"
  if (v === "dr" || v === "d") return "Drain"
  if (v === "¼" || v === "1/4") return "25%"
  if (v === "½" || v === "1/2") return "50%"
  if (v === "¾" || v === "3/4") return "75%"
  if (v === "s") return "Resist"
  if (v === "w") return "Weak"
  const num = Number.parseFloat(v)
  if (Number.isFinite(num)) {
    const pct = Math.round(num * 100)
    return `${pct}%`
  }
  return v
}

function AffinityLabelCell({
  elem,
  colSpan = 1,
}: {
  elem: string
  colSpan?: number
}) {
  const icon = DEVIL_RESIST_ICON[elem]
  const title = DEVIL_RESIST_TITLE[elem] ?? elem
  const abbrev = AFFINITY_ABBREV[elem] ?? elem.slice(0, 4).toUpperCase()
  const shortName = title.split(" / ")[0]
  return (
    <th
      colSpan={colSpan}
      className={cn(CELL, "bg-[color:oklch(0.28_0.04_250_/_0.55)] font-medium")}
      title={title}
    >
      <div className="flex flex-col items-center gap-0.5">
        {icon ? (
          <Image
            src={`/wiki/affinity/${icon}.jpeg`}
            alt=""
            width={22}
            height={22}
            className="size-[22px] object-contain"
            unoptimized
          />
        ) : null}
        <span className="text-[11px] leading-tight text-foreground">
          {shortName}{" "}
          <span className="text-muted-foreground">({abbrev})</span>
        </span>
      </div>
    </th>
  )
}

function AffinityValueCell({
  elem,
  value,
  colSpan = 1,
}: {
  elem: string
  value: string
  colSpan?: number
}) {
  const kind = devilResistKind(value)
  const display = formatResistDisplay(value)
  return (
    <td
      colSpan={colSpan}
      className={cn(
        CELL,
        "bg-[color:oklch(0.22_0.035_250_/_0.65)] font-mono text-xs",
        RESIST_KIND_CLASS[kind]
      )}
      title={`${DEVIL_RESIST_TITLE[elem] ?? elem}: ${value || "×1"}`}
    >
      {display}
    </td>
  )
}

function AffinityGrid({ demon }: { demon: DevilCatalogEntry }) {
  const available = new Set(demon.resistElems)
  const bands = AFFINITY_TABLE_BANDS.map((band) =>
    band.filter((elem) => available.has(elem) || elem in demon.resists)
  ).filter((band) => band.length > 0)

  const wideRow = AFFINITY_WIDE_ROW.filter(
    (elem) => available.has(elem) || elem in demon.resists
  )

  // Fall back if payload is an older 12-elem catalog.
  const rows =
    bands.length > 0
      ? bands
      : [
          demon.resistElems.slice(0, 6),
          demon.resistElems.slice(6, 12),
        ].filter((b) => b.length > 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr>
            <th
              colSpan={6}
              className={cn(
                CELL,
                "bg-[color:oklch(0.32_0.045_250_/_0.7)] py-2 text-xs font-semibold uppercase tracking-wider text-foreground"
              )}
            >
              Defensive Affinity
            </th>
          </tr>
          <tr>
            <th
              colSpan={3}
              className={cn(
                CELL,
                "bg-[color:oklch(0.26_0.04_250_/_0.6)] text-xs font-semibold text-foreground"
              )}
            >
              Physical Resistance
            </th>
            <th
              colSpan={3}
              className={cn(
                CELL,
                "bg-[color:oklch(0.26_0.04_250_/_0.6)] text-xs font-semibold text-foreground"
              )}
            >
              Magical Resistance
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((band) => {
            const cells = [...band]
            while (cells.length < 6) cells.push("")
            const key = band.join("-")
            return (
              <Fragment key={key}>
                <tr>
                  {cells.map((elem, i) =>
                    elem ? (
                      <AffinityLabelCell key={elem} elem={elem} />
                    ) : (
                      <th key={`empty-l-${i}`} className={CELL} />
                    )
                  )}
                </tr>
                <tr>
                  {cells.map((elem, i) =>
                    elem ? (
                      <AffinityValueCell
                        key={elem}
                        elem={elem}
                        value={demon.resists[elem] ?? ""}
                      />
                    ) : (
                      <td key={`empty-v-${i}`} className={CELL} />
                    )
                  )}
                </tr>
              </Fragment>
            )
          })}
          {wideRow.length > 0 ? (
            <>
              <tr>
                {wideRow.map((elem) => (
                  <AffinityLabelCell key={elem} elem={elem} colSpan={2} />
                ))}
              </tr>
              <tr>
                {wideRow.map((elem) => (
                  <AffinityValueCell
                    key={elem}
                    elem={elem}
                    colSpan={2}
                    value={demon.resists[elem] ?? ""}
                  />
                ))}
              </tr>
            </>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

export function WikiDemonDetailView({
  demon,
  family,
  mitama,
}: {
  demon: DevilCatalogEntry
  family: DevilCatalogEntry[]
  mitama: DevilCatalogEntry | null
}) {
  const fusionTiers = demonFusionSkillTiers(demon.inheritanceType)
  const inheritCats = devilInheritanceAllowedCategories(
    demon.inheritanceRestrictions
  )
  const related = family
    .filter((d) => d.id !== demon.id)
    .sort((a, b) => {
      if (a.isStock !== b.isStock) return a.isStock ? -1 : 1
      return a.id - b.id
    })
  const stock = family.find((d) => d.isStock) ?? null

  const acquisition = [...demon.acquisitionSkills].sort(
    (a, b) => a.level - b.level || a.id - b.id
  )

  return (
    <div className="space-y-3">
      <WikiBreadcrumb
        segments={[
          { label: "Item wiki", href: "/wiki" },
          { label: "Demons", href: "/wiki/demons" },
          { label: demon.name },
        ]}
      />

      <article className="border border-border bg-card/40">
        <header className="flex items-start gap-3 border-b border-border px-3 py-2.5 sm:px-4">
          {demon.iconSrc ? (
            <Image
              src={demon.iconSrc}
              alt=""
              width={56}
              height={56}
              className="size-14 shrink-0 object-contain"
              unoptimized
            />
          ) : (
            <span className="size-14 shrink-0 bg-muted/40" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-xl tracking-wide uppercase leading-tight">
              {demon.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              <span className="font-mono text-xs">#{demon.id}</span>
              <span aria-hidden>·</span>
              <span
                className={cn("font-medium", RACE_ALIGN_CLASS[demon.alignment])}
                title={`${demon.alignment} (LNC ${demon.lnc})`}
              >
                {demon.race}
              </span>
              <span aria-hidden>·</span>
              <span>{formatDevilFamily(demon.family)}</span>
              {demon.level > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span>Lv {demon.level}</span>
                </>
              ) : null}
              {demon.variantTag ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{demon.variantTag}</span>
                </>
              ) : null}
            </p>
            {!demon.isStock && stock ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Stock form:{" "}
                <Link
                  href={`/wiki/demons/${stock.id}`}
                  className="text-foreground hover:text-gold-hot"
                >
                  {stock.name} #{stock.id}
                </Link>
              </p>
            ) : null}
          </div>
        </header>
      </article>

      <Section title="Base stats">
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <MetaRow label="HP" value={demon.stats.hp || "—"} />
            <MetaRow label="MP" value={demon.stats.mp || "—"} />
            <MetaRow label="Strength" value={demon.stats.str} />
            <MetaRow label="Magic" value={demon.stats.magic} />
            <MetaRow label="Vitality" value={demon.stats.vit} />
            <MetaRow label="Intelligence" value={demon.stats.int} />
            <MetaRow label="Agility" value={demon.stats.speed} />
            <MetaRow label="Luck" value={demon.stats.luck} />
            <MetaRow label="Force stack" value={demon.forceStack || "—"} />
            <MetaRow label="Growth type" value={getGrowthTypeLabel(demon.growthType) || "—"} />
            <MetaRow
              label="Fusion difficulty"
              value={demon.fusionDifficulty || "—"}
            />
            <MetaRow label="Gender" value={demon.gender} />
          </dl>
          <p className="mt-2 text-[11px] text-muted-foreground">
            CorrectTbl base values before level growth.
          </p>
        </Section>

      <section className="border border-border bg-card/40 p-2 sm:p-3">
        <AffinityGrid demon={demon} />
      </section>

      <Section title="Features">
        {demon.traits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No traits listed.</p>
        ) : (
          <ul className="space-y-2">
            {demon.traits.map((id) => {
              const skill = getSkill(id)
              return (
                <li key={id} className="text-sm">
                  <SkillLink skillId={id} />
                  {skill?.description ? (
                    <p className="mt-0.5 pl-7 text-xs text-muted-foreground">
                      {skill.description}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title="Demon skills">
        <div className="space-y-4">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Default
            </h3>
            {demon.skills.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <ul className="space-y-1">
                {demon.skills.map((id) => (
                  <li key={id}>
                    <SkillLink skillId={id} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Learned by level
            </h3>
            {acquisition.length === 0 ? (
              <p className="text-sm text-muted-foreground">None</p>
            ) : (
              <ul className="space-y-1">
                {acquisition.map((row) => (
                  <li
                    key={`${row.level}-${row.id}`}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm"
                  >
                    <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
                      Lv{row.level}
                    </span>
                    <SkillLink skillId={row.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          {demon.enemyOnlySkills.length > 0 ? (
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Enemy only
              </h3>
              <ul className="space-y-1">
                {demon.enemyOnlySkills.map((id) => (
                  <li key={id}>
                    <SkillLink skillId={id} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </Section>

      <Section title="Inheritance">
        <dl>
          <MetaRow label="Type" value={demon.inheritanceType} />
          <MetaRow
            label="Slot mask"
            value={
              <span className="font-mono text-xs">
                {demon.inheritanceRestrictions} (0x
                {demon.inheritanceRestrictions.toString(16)})
              </span>
            }
          />
        </dl>
        {fusionTiers ? (
          <div className="mt-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Fusion progress skills
            </h3>
            <ul className="space-y-1">
              {fusionTiers.map((id, i) => (
                <li
                  key={id}
                  className="flex flex-wrap items-center gap-x-2 text-sm"
                >
                  <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
                    Tier {i + 1}
                  </span>
                  <SkillLink skillId={id} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {inheritCats.length > 0 ? (
          <div className="mt-3">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Can inherit
            </h3>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Fusion only passes skills whose inheritance type matches a slot
              below. Possible = normal skills; Breath / Wing / Charge / Bite /
              Claw / Needle / Weapon / Maiden / Eyes = body-type skills;
              Impossible skills never pass.
            </p>
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {inheritCats.map((c) => (
                <li
                  key={c.bit}
                  className="border border-border bg-muted/30 px-1.5 py-0.5"
                  title={`Skill inheritance type ${c.bit}`}
                >
                  {c.label}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            No fusion inheritance slots (mask 0).
          </p>
        )}
      </Section>

      {demon.mitamaFusionId > 0 ? (
        <Section title="Mitama">
          {mitama ? (
            <Link
              href={`/wiki/demons/${mitama.id}`}
              className="inline-flex items-center gap-2 text-sm hover:text-gold-hot"
            >
              {mitama.iconSrc ? (
                <Image
                  src={mitama.iconSrc}
                  alt=""
                  width={28}
                  height={28}
                  className="size-7 object-contain"
                  unoptimized
                />
              ) : null}
              <span>
                {mitama.name}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  #{mitama.id}
                </span>
              </span>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">
              Mitama form ID {demon.mitamaFusionId} (not in catalog).
            </p>
          )}
        </Section>
      ) : null}

      {related.length > 0 ? (
        <Section title="Related forms">
          <ul className="grid gap-1 sm:grid-cols-2">
            {related.slice(0, 40).map((d) => (
              <li key={d.id}>
                <Link
                  href={`/wiki/demons/${d.id}`}
                  className="inline-flex items-center gap-2 text-sm hover:text-gold-hot"
                >
                  {d.iconSrc ? (
                    <Image
                      src={d.iconSrc}
                      alt=""
                      width={22}
                      height={22}
                      className="size-[22px] object-contain"
                      unoptimized
                    />
                  ) : (
                    <span className="size-[22px] bg-muted/40" />
                  )}
                  <span className="truncate">
                    {d.name}
                    {d.isStock ? " (stock)" : ""}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    #{d.id}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {related.length > 40 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing 40 of {related.length} related IDs.
            </p>
          ) : null}
        </Section>
      ) : null}
    </div>
  )
}
