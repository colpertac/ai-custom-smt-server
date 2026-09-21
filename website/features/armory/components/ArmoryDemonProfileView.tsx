import Link from "next/link"

import { ArmoryEquipSlot } from "@/features/armory/components/ArmoryEquipSlot"
import { ArmoryHero } from "@/features/armory/components/ArmoryHero"
import { ArmorySkillChip } from "@/features/armory/components/ArmorySkillChip"
import { MitamaBranchSetsSidebar } from "@/features/armory/components/MitamaBranchSetsSidebar"
import type { ArmoryDemonDetail } from "@/lib/armory-demons"
import {
  getMitamaSpiritOption,
  getMitamaTypeName,
  getReunionBranchName,
  mitamaSlotsAvailableForRank,
  mitamaSpiritFromBonusId,
} from "@/lib/demon-reunion-edit-shared"
import { getGrowthTypeLabel } from "@/lib/growth-type-catalog"
import { cn } from "@/lib/utils"

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
  const mitamaBranches = Array.from({ length: 12 }, (_, g) => {
    const available = mitamaSlotsAvailableForRank(demon.reunion[g] ?? 0)
    const slots = demon.mitamaReunion.slice(g * 8, g * 8 + 8)
    const filled = slots
      .slice(0, available)
      .filter((id) => id > 0).length
    return { slots, filled, available }
  })
  const hasMitamaBonus = mitamaBranches.some((b) => b.filled > 0)
  const mitamaTotals = [0, 0, 0, 0]
  for (const id of demon.mitamaReunion) {
    const spirit = mitamaSpiritFromBonusId(id)
    if (spirit > 0) mitamaTotals[spirit - 1]!++
  }
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
          {` · Growth ${getGrowthTypeLabel(demon.growthType)}`}
          {demon.mitamaRank > 0 || demon.mitamaType > 0
            ? ` · Mitama rank ${demon.mitamaRank} (${getMitamaTypeName(demon.mitamaType)})`
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
            <ArmoryEquipSlot key={s.slot} slot={s} align="left" />
          ))}
        </div>

        <ArmoryHero
          name={demon.name}
          className="order-first min-h-[18rem] lg:order-none"
        />

        <div className="flex flex-col gap-1.5">
          {right.map((s) => (
            <ArmoryEquipSlot key={s.slot} slot={s} align="right" />
          ))}
        </div>
      </div>

      <section className="border-2 border-border bg-card/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-heading text-sm font-semibold tracking-wide uppercase">
              Reunion ranks
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Twelve growth-group ranks (capped at 8 each for the total above).
            </p>
          </div>
          <MitamaBranchSetsSidebar />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-12">
          {demon.reunion.map((rank, i) => (
            <div
              key={i}
              className={cn(
                "border border-border px-1 py-2 text-center",
                rank > 0 ? "bg-muted/60" : "opacity-40"
              )}
            >
              <div
                className="truncate text-[10px] text-muted-foreground"
                title={getReunionBranchName(i)}
              >
                {getReunionBranchName(i)}
              </div>
              <div className="font-medium">{rank}</div>
            </div>
          ))}
        </div>
      </section>

      {hasMitamaBonus ? (
        <section className="border-2 border-border bg-card/50 p-4">
          <div>
            <h2 className="font-heading text-sm font-semibold tracking-wide uppercase">
              Mitama rebirth bar
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Colored blocks are mitama allocations (Ara / Nigi / Kusi / Saki).
              Open slots equal that branch&apos;s reunion rank.
            </p>
          </div>
          <div className="mt-3 space-y-2">
            {mitamaBranches.map((branch, i) => (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-[5.5rem_1fr_auto] items-center gap-2",
                  branch.filled > 0 || branch.available > 0
                    ? ""
                    : "opacity-40"
                )}
              >
                <div
                  className="truncate text-[10px] text-muted-foreground"
                  title={getReunionBranchName(i)}
                >
                  {getReunionBranchName(i)}
                </div>
                <div className="flex gap-0.5">
                  {branch.slots.map((id, s) => {
                    const open = s < branch.available
                    const spirit = open ? mitamaSpiritFromBonusId(id) : 0
                    const opt = getMitamaSpiritOption(spirit)
                    return (
                      <span
                        key={s}
                        className={cn(
                          "mitama-bevel-slot relative flex h-7 min-w-0 flex-1 items-center justify-center",
                          !open && "opacity-35"
                        )}
                        title={
                          !open
                            ? `Locked — reunion rank ${branch.available}`
                            : spirit > 0
                              ? `${opt.name} (id ${id})`
                              : "Empty"
                        }
                      >
                        <span
                          className="mitama-bevel-inner block h-[22px] w-[80%]"
                          data-spirit={open ? String(spirit) : "locked"}
                        />
                      </span>
                    )
                  })}
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {branch.filled}/{branch.available}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            {(
              [
                [1, "Ara"],
                [2, "Nigi"],
                [3, "Kusi"],
                [4, "Saki"],
              ] as const
            ).map(([spirit, label]) => (
              <span key={spirit} className="inline-flex items-center gap-1.5">
                <span
                  className="mitama-bevel-inner inline-block size-2.5"
                  data-spirit={String(spirit)}
                  aria-hidden
                />
                {label} {mitamaTotals[spirit - 1]}
              </span>
            ))}
          </p>
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

      {demon.skills.filter((id) => id > 0).length > 0 ? (
        <section className="border-2 border-border bg-card/50 p-4">
          <h2 className="font-heading text-sm font-semibold tracking-wide uppercase">
            Learned skills
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {demon.skills
              .filter((id) => id > 0)
              .map((id) => (
                <li key={id}>
                  <ArmorySkillChip skillId={id} />
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {demon.inheritedSkills.filter((s) => s.skillId > 0).length > 0 ? (
        <section className="border-2 border-border bg-card/50 p-4">
          <h2 className="font-heading text-sm font-semibold tracking-wide uppercase">
            Inherited skills
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {demon.inheritedSkills
              .filter((s) => s.skillId > 0)
              .map((s, i) => (
                <li key={`${s.skillId}-${s.progress}-${i}`}>
                  <ArmorySkillChip
                    skillId={s.skillId}
                    progress={s.progress}
                  />
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
