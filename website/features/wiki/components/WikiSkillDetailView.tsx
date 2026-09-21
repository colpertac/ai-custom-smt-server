import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import type { WikiSkill, WikiSkillLearner } from "@/content/wiki/types"
import {
  DEVIL_RESIST_ICON,
  DEVIL_RESIST_TITLE,
} from "@/lib/armory-catalogs"
import { WikiBreadcrumb } from "@/features/wiki/components/WikiShell"
import { WIKI_SKILLS_META } from "@/features/wiki/wiki-nav"
import { cn } from "@/lib/utils"

function SkillIcon({
  skill,
  size = 56,
}: {
  skill: WikiSkill
  size?: number
}) {
  if (!skill.iconSrc) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center border border-border bg-muted/60 font-mono text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        style={{ width: size, height: size }}
        aria-label="Icon not available"
      >
        NA
      </span>
    )
  }
  return (
    <Image
      src={skill.iconSrc}
      alt=""
      width={size}
      height={size}
      className="pixelated shrink-0 border border-border bg-black/40 object-contain"
      unoptimized
    />
  )
}

function AffinityValue({ skill }: { skill: WikiSkill }) {
  const key = skill.affinityKey
  const label = skill.affinityLabel
  if (!key || !label) return <span>—</span>
  const icon = DEVIL_RESIST_ICON[key]
  const title = DEVIL_RESIST_TITLE[key] ?? label
  return (
    <span className="inline-flex items-center justify-end gap-1.5" title={title}>
      {icon ? (
        <Image
          src={`/wiki/affinity/${icon}.jpeg`}
          alt=""
          width={16}
          height={16}
          className="size-4 object-contain"
          unoptimized
        />
      ) : null}
      <span>{label}</span>
    </span>
  )
}

function levelBracketLabel(level: number | null): string {
  if (level == null) return "Already learned"
  if (level < 10) return "Lv 1–9"
  const lo = Math.floor(level / 10) * 10
  return `Lv ${lo}–${lo + 9}`
}

function groupLearners(learners: WikiSkillLearner[]) {
  const groups = new Map<string, WikiSkillLearner[]>()
  const order: string[] = []
  for (const learner of learners) {
    const label = levelBracketLabel(learner.level)
    if (!groups.has(label)) {
      groups.set(label, [])
      order.push(label)
    }
    groups.get(label)!.push(learner)
  }
  // Ensure "Already learned" first
  order.sort((a, b) => {
    if (a === "Already learned") return -1
    if (b === "Already learned") return 1
    return a.localeCompare(b, undefined, { numeric: true })
  })
  return order.map((label) => ({ label, learners: groups.get(label)! }))
}

export function WikiSkillDetailView({ skill }: { skill: WikiSkill }) {
  const learners = skill.learnedBy ?? []
  const groups = groupLearners(learners)

  const metaRows: Array<{ label: string; value: ReactNode }> = [
    { label: "Type", value: skill.categoryLabel ?? "—" },
    { label: "Affinity", value: <AffinityValue skill={skill} /> },
    { label: "Action Type", value: skill.actionType ?? "—" },
    { label: "Cost", value: skill.cost ?? "—" },
    { label: "Inheritance", value: skill.inheritance ?? "—" },
    { label: "Effect", value: skill.effectLabel ?? "—" },
    {
      label: "Modifier",
      value:
        skill.modifier != null && skill.modifier !== 0
          ? String(skill.modifier)
          : skill.modifier === 0
            ? "0"
            : "—",
    },
    { label: "Stat", value: skill.stat ?? "—" },
    { label: "AOE Type", value: skill.aoeType ?? "—" },
    {
      label: "AOE Range",
      value:
        skill.aoeRange != null && skill.aoeRange > 0
          ? String(skill.aoeRange)
          : "—",
    },
    { label: "Incantation", value: skill.incantation ?? "—" },
    { label: "Cooldown", value: skill.cooldown ?? "—" },
    {
      label: "Stack",
      value: skill.stack != null ? String(skill.stack) : "—",
    },
    {
      label: "Knockback",
      value: skill.knockback != null ? String(skill.knockback) : "—",
    },
  ]

  return (
    <div className="space-y-3">
      <WikiBreadcrumb
        segments={[
          { label: "Item wiki", href: "/wiki" },
          { label: WIKI_SKILLS_META.title, href: WIKI_SKILLS_META.href },
          { label: skill.name },
        ]}
      />

      <article className="border border-border bg-card/40">
        <header className="flex items-start gap-3 border-b border-border px-3 py-2.5 sm:px-4">
          <SkillIcon skill={skill} />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-xl tracking-wide uppercase leading-tight">
              {skill.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
              <span className="font-mono text-xs">#{skill.id}</span>
              {skill.affinityLabel ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{skill.affinityLabel}</span>
                </>
              ) : null}
              {skill.categoryLabel ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{skill.categoryLabel}</span>
                </>
              ) : null}
            </p>
          </div>
        </header>

        <div className="grid gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-4">
          <div className="min-w-0 space-y-4">
            <section>
              <h2 className="font-heading text-xs font-semibold tracking-[0.12em] uppercase text-gold-dim">
                Description
              </h2>
              <p className="mt-1.5 text-sm leading-snug text-foreground/90">
                {skill.description || "No in-game description on record."}
              </p>
            </section>

            <section>
              <h2 className="font-heading text-xs font-semibold tracking-[0.12em] uppercase text-gold-dim">
                Learned by
              </h2>
              {groups.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No demons list this skill in DevilData innate or acquisition
                  tables.
                </p>
              ) : (
                <div className="mt-2 space-y-3">
                  {groups.map((group) => (
                    <div key={group.label}>
                      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </h3>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {group.learners.map((learner) => (
                          <li key={`${learner.demonId}-${learner.level ?? "innate"}`}>
                            <Link
                              href={`/wiki/demons/${learner.demonId}`}
                              className="text-sky-400 no-underline hover:text-sky-300"
                            >
                              {learner.name}
                            </Link>
                            {learner.level != null ? (
                              <span className="text-muted-foreground">
                                {" "}
                                ({learner.level})
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside>
            <div className="border border-border bg-muted/30 px-2.5 py-2">
              <h3 className="font-heading text-[0.65rem] font-semibold tracking-[0.14em] uppercase text-muted-foreground">
                Details
              </h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                {metaRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-start justify-between gap-3"
                  >
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd
                      className={cn(
                        "max-w-[14rem] text-right font-medium",
                        row.label === "Effect" && "text-left sm:text-right"
                      )}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>
        </div>
      </article>
    </div>
  )
}
