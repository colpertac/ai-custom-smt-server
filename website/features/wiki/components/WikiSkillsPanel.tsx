"use client"

import Image from "next/image"
import Link from "next/link"
import { useMemo, useState } from "react"

import type { WikiSkill } from "@/content/wiki/types"
import {
  DEVIL_RESIST_ICON,
  DEVIL_RESIST_TITLE,
} from "@/lib/armory-catalogs"
import {
  WIKI_PAGE_SIZE,
  WikiPagination,
} from "@/features/wiki/components/WikiPagination"
import { WikiPageHeader } from "@/features/wiki/components/WikiShell"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type SkillFilters = {
  query: string
  category: string | null
  affinity: string | null
  actionType: string | null
  aoeType: string | null
  stat: string | null
  inheritance: string | null
}

function uniqueSorted(
  skills: WikiSkill[],
  pick: (s: WikiSkill) => string | null | undefined
): string[] {
  const set = new Set<string>()
  for (const s of skills) {
    const v = pick(s)?.trim()
    if (v) set.add(v)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

function inheritanceBucket(skill: WikiSkill): string | null {
  const label = skill.inheritance?.trim()
  if (!label) return null
  if (label === "Possible" || label === "Impossible") return label
  if (label.startsWith("Restricted")) return "Restricted"
  return label
}

function matchesQuery(skill: WikiSkill, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const idStr = String(skill.id)
  if (idStr === q || idStr.startsWith(q)) return true
  if (skill.name.toLowerCase().includes(q)) return true
  if (skill.description.toLowerCase().includes(q)) return true
  if (skill.affinityKey?.toLowerCase().includes(q)) return true
  if (skill.affinityLabel?.toLowerCase().includes(q)) return true
  if (skill.actionType?.toLowerCase().includes(q)) return true
  if (skill.aoeType?.toLowerCase().includes(q)) return true
  if (skill.stat?.toLowerCase().includes(q)) return true
  if (skill.categoryLabel?.toLowerCase().includes(q)) return true
  if (skill.effectLabel?.toLowerCase().includes(q)) return true
  return false
}

function filterSkills(all: WikiSkill[], filters: SkillFilters): WikiSkill[] {
  return all.filter((s) => {
    if (!matchesQuery(s, filters.query)) return false
    if (filters.category && s.categoryLabel !== filters.category) return false
    if (filters.affinity && s.affinityLabel !== filters.affinity) return false
    if (filters.actionType && s.actionType !== filters.actionType) return false
    if (filters.aoeType && s.aoeType !== filters.aoeType) return false
    if (filters.stat && s.stat !== filters.stat) return false
    if (
      filters.inheritance &&
      inheritanceBucket(s) !== filters.inheritance
    ) {
      return false
    }
    return true
  })
}

function SkillIcon({ skill, size = 28 }: { skill: WikiSkill; size?: number }) {
  if (!skill.iconSrc) {
    return (
      <span
        className="inline-block shrink-0 border border-border bg-muted/40"
        style={{ width: size, height: size }}
        aria-hidden
      />
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

function AffinityCell({ skill }: { skill: WikiSkill }) {
  const key = skill.affinityKey
  const label = skill.affinityLabel
  if (!key || !label) {
    return <span className="text-muted-foreground">—</span>
  }
  const icon = DEVIL_RESIST_ICON[key]
  const title = DEVIL_RESIST_TITLE[key] ?? label
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      title={title}
    >
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
      <span className="text-foreground">{label}</span>
    </span>
  )
}

const selectClass =
  "flex h-9 w-full rounded-none border border-border bg-background px-2 text-sm"

export function WikiSkillsPanel({ skills }: { skills: WikiSkill[] }) {
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const [affinity, setAffinity] = useState<string | null>(null)
  const [actionType, setActionType] = useState<string | null>(null)
  const [aoeType, setAoeType] = useState<string | null>(null)
  const [stat, setStat] = useState<string | null>(null)
  const [inheritance, setInheritance] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const categories = useMemo(
    () => uniqueSorted(skills, (s) => s.categoryLabel),
    [skills]
  )
  const affinities = useMemo(
    () => uniqueSorted(skills, (s) => s.affinityLabel),
    [skills]
  )
  const actionTypes = useMemo(
    () => uniqueSorted(skills, (s) => s.actionType),
    [skills]
  )
  const aoeTypes = useMemo(
    () => uniqueSorted(skills, (s) => s.aoeType),
    [skills]
  )
  const stats = useMemo(() => uniqueSorted(skills, (s) => s.stat), [skills])
  const inheritances = useMemo(() => {
    const set = new Set<string>()
    for (const s of skills) {
      const b = inheritanceBucket(s)
      if (b) set.add(b)
    }
    return [...set].sort((a, b) => {
      const order = ["Possible", "Impossible", "Restricted"]
      return order.indexOf(a) - order.indexOf(b) || a.localeCompare(b)
    })
  }, [skills])

  const filtered = useMemo(
    () =>
      filterSkills(skills, {
        query,
        category,
        affinity,
        actionType,
        aoeType,
        stat,
        inheritance,
      }),
    [skills, query, category, affinity, actionType, aoeType, stat, inheritance]
  )

  const total = filtered.length
  const pageCount = Math.max(1, Math.ceil(total / WIKI_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const slice = filtered.slice(
    safePage * WIKI_PAGE_SIZE,
    (safePage + 1) * WIKI_PAGE_SIZE
  )

  const resetPage = () => setPage(0)

  const filtersActive = Boolean(
    query.trim() ||
      category ||
      affinity ||
      actionType ||
      aoeType ||
      stat ||
      inheritance
  )

  return (
    <div className="space-y-6">
      <WikiPageHeader
        title="Skills"
        description={`${skills.length.toLocaleString()} CSkillData entries. Use the ID with @skill (e.g. @skill 5001 for Agi). Add demon as a second argument to grant to your partner. Affinity comes from Shield SkillData.`}
      />

      <div className="grid gap-4 border border-border bg-card/40 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Field className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
          <FieldLabel htmlFor="wiki-filter-skills">Filter skills</FieldLabel>
          <Input
            id="wiki-filter-skills"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              resetPage()
            }}
            placeholder="Name, affinity, effect, description, or skill ID…"
            autoComplete="off"
            autoFocus
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="wiki-filter-skill-type">Type</FieldLabel>
          <select
            id="wiki-filter-skill-type"
            className={selectClass}
            value={category ?? ""}
            onChange={(e) => {
              setCategory(e.target.value || null)
              resetPage()
            }}
          >
            <option value="">Any type</option>
            {categories.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <FieldLabel htmlFor="wiki-filter-skill-affinity">Affinity</FieldLabel>
          <select
            id="wiki-filter-skill-affinity"
            className={selectClass}
            value={affinity ?? ""}
            onChange={(e) => {
              setAffinity(e.target.value || null)
              resetPage()
            }}
          >
            <option value="">Any affinity</option>
            {affinities.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <FieldLabel htmlFor="wiki-filter-skill-action">Action type</FieldLabel>
          <select
            id="wiki-filter-skill-action"
            className={selectClass}
            value={actionType ?? ""}
            onChange={(e) => {
              setActionType(e.target.value || null)
              resetPage()
            }}
          >
            <option value="">Any action</option>
            {actionTypes.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <FieldLabel htmlFor="wiki-filter-skill-aoe">AOE type</FieldLabel>
          <select
            id="wiki-filter-skill-aoe"
            className={selectClass}
            value={aoeType ?? ""}
            onChange={(e) => {
              setAoeType(e.target.value || null)
              resetPage()
            }}
          >
            <option value="">Any AOE</option>
            {aoeTypes.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <FieldLabel htmlFor="wiki-filter-skill-stat">Stat</FieldLabel>
          <select
            id="wiki-filter-skill-stat"
            className={selectClass}
            value={stat ?? ""}
            onChange={(e) => {
              setStat(e.target.value || null)
              resetPage()
            }}
          >
            <option value="">Any stat</option>
            {stats.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field>
          <FieldLabel htmlFor="wiki-filter-skill-inherit">
            Inheritance
          </FieldLabel>
          <select
            id="wiki-filter-skill-inherit"
            className={selectClass}
            value={inheritance ?? ""}
            onChange={(e) => {
              setInheritance(e.target.value || null)
              resetPage()
            }}
          >
            <option value="">Any inheritance</option>
            {inheritances.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3 xl:col-span-2 self-end pb-1">
          {filtersActive
            ? `${total.toLocaleString()} match${total === 1 ? "" : "es"}`
            : `${total.toLocaleString()} skills`}
        </p>
      </div>

      <WikiPagination page={safePage} total={total} onPageChange={setPage} />

      {slice.length === 0 ? (
        <div className="border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
          No skills match. Try another name, filter, or ID.
        </div>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-2 font-medium" />
                <th className="px-2 py-2 font-medium">ID</th>
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Affinity</th>
                <th className="px-2 py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border/80 transition-colors hover:bg-muted/30"
                >
                  <td className="px-1.5 py-1">
                    <Link href={`/wiki/skills/${s.id}`} className="block">
                      <SkillIcon skill={s} />
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 font-mono tabular-nums text-foreground">
                    <Link
                      href={`/wiki/skills/${s.id}`}
                      className="no-underline hover:text-gold-hot"
                    >
                      {s.id}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-foreground">
                    <Link
                      href={`/wiki/skills/${s.id}`}
                      className="no-underline hover:text-gold-hot"
                    >
                      {s.name}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">
                    <AffinityCell skill={s} />
                  </td>
                  <td
                    className={cn(
                      "max-w-[28rem] px-2 py-1.5 text-muted-foreground",
                      "truncate"
                    )}
                    title={s.description}
                  >
                    {s.description || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <WikiPagination page={safePage} total={total} onPageChange={setPage} />
    </div>
  )
}
