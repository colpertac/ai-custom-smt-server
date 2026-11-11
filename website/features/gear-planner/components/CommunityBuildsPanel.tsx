"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import { BuildLikeButton } from "@/features/gear-planner/components/BuildLikeButton"
import { Button, buttonVariants } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  PLANNER_STATS,
  type PlannerStatKey,
} from "@/lib/gear-planner-combat"
import { cn } from "@/lib/utils"

type CombatBonusChip = {
  key: string
  abbr: string
  label: string
  raw: number
  display: string
  atCap: boolean
}

type BuildSummary = {
  gender: 0 | 1
  level: number
  lnc: number
  bonuses: CombatBonusChip[]
}

type CapKey = "lbc" | "tac" | "pc" | "incant" | "cooldown" | "pp"

type PublicBuild = {
  id: string
  name: string
  username: string
  shareToken: string
  path: string
  updatedAt: number
  publishedAt: number
  likeCount?: number
  likedByMe?: boolean
  summary?: BuildSummary
}

type SortMode = "newest" | "liked"
type GenderFilter = "any" | "male" | "female"

type AdvancedDraft = {
  mins: Partial<Record<PlannerStatKey, string>>
  maxIncant: string
  maxCooldown: string
  minLikes: string
  minLevel: string
}

type AdvancedApplied = {
  mins: Partial<Record<PlannerStatKey, number>>
  maxIncant: number | null
  maxCooldown: number | null
  minLikes: number | null
  minLevel: number | null
}

const CAP_OPTIONS: Array<{ key: CapKey; label: string }> = [
  { key: "lbc", label: "LBC" },
  { key: "tac", label: "TAC" },
  { key: "pc", label: "PC" },
  { key: "pp", label: "PP" },
  { key: "incant", label: "Incant" },
  { key: "cooldown", label: "CD" },
]

const MIN_PARAM: Partial<Record<PlannerStatKey, string>> = {
  critical: "minCritical",
  fcc: "minFcc",
  lbc: "minLbc",
  lbp: "minLbp",
  lbCap: "minLbCap",
  tac: "minTac",
  tap: "minTap",
  pc: "minPc",
  pp: "minPp",
}

const EMPTY_DRAFT: AdvancedDraft = {
  mins: {},
  maxIncant: "",
  maxCooldown: "",
  minLikes: "",
  minLevel: "",
}

const EMPTY_APPLIED: AdvancedApplied = {
  mins: {},
  maxIncant: null,
  maxCooldown: null,
  minLikes: null,
  minLevel: null,
}

function parseOptionalInt(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  return Math.floor(n)
}

function draftToApplied(draft: AdvancedDraft): AdvancedApplied {
  const mins: Partial<Record<PlannerStatKey, number>> = {}
  for (const def of PLANNER_STATS) {
    if (def.kind === "reduction") continue
    const key = def.key as PlannerStatKey
    const n = parseOptionalInt(draft.mins[key] ?? "")
    if (n != null) mins[key] = n
  }
  return {
    mins,
    maxIncant: parseOptionalInt(draft.maxIncant),
    maxCooldown: parseOptionalInt(draft.maxCooldown),
    minLikes: parseOptionalInt(draft.minLikes),
    minLevel: parseOptionalInt(draft.minLevel),
  }
}

function advancedIsActive(applied: AdvancedApplied, caps: CapKey[]): boolean {
  return (
    caps.length > 0 ||
    Object.keys(applied.mins).length > 0 ||
    applied.maxIncant != null ||
    applied.maxCooldown != null ||
    applied.minLikes != null ||
    applied.minLevel != null
  )
}

function GenderMark({ gender }: { gender: 0 | 1 }) {
  if (gender === 0) {
    return (
      <span className="text-[#5eb0ff]" title="Male" aria-label="Male">
        ♂
      </span>
    )
  }
  return (
    <span className="text-[#ff7eb3]" title="Female" aria-label="Female">
      ♀
    </span>
  )
}

function isNeutralBonus(bonus: CombatBonusChip): boolean {
  if (bonus.key === "incant" || bonus.key === "cooldown") {
    return bonus.display === "0%"
  }
  if (bonus.key === "lbCap") {
    return bonus.raw === 30000
  }
  return bonus.raw === 0 || bonus.display === "0" || bonus.display === "0%"
}

function CombatBonusChips({ bonuses }: { bonuses: CombatBonusChip[] }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        Combat bonuses
      </p>
      <dl className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] tracking-wide uppercase">
        {bonuses.map((bonus) => {
          const neutral = !bonus.atCap && isNeutralBonus(bonus)
          return (
            <div key={bonus.key} className="flex gap-1">
              <dt className="text-muted-foreground" title={bonus.label}>
                {bonus.abbr}
              </dt>
              <dd
                className={cn(
                  "font-medium tabular-nums",
                  bonus.atCap
                    ? "text-gold-hot"
                    : neutral
                      ? "text-muted-foreground/55"
                      : "text-foreground"
                )}
                title={
                  bonus.atCap
                    ? `${bonus.label} — at practical cap`
                    : bonus.label
                }
              >
                {bonus.display}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

const PAGE_SIZE = 20

function CommunityPagination({
  total,
  page,
  loading,
  onPageChange,
}: {
  total: number
  page: number
  loading: boolean
  onPageChange: (page: number) => void
}) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const [pageInput, setPageInput] = useState(String(safePage + 1))

  useEffect(() => {
    setPageInput(String(safePage + 1))
  }, [safePage])

  if (total <= PAGE_SIZE) return null

  const rangeStart = safePage * PAGE_SIZE + 1
  const rangeEnd = Math.min(total, (safePage + 1) * PAGE_SIZE)

  const goToInputPage = () => {
    const n = Number(pageInput)
    if (!Number.isFinite(n)) {
      setPageInput(String(safePage + 1))
      return
    }
    const next = Math.min(pageCount, Math.max(1, Math.floor(n))) - 1
    setPageInput(String(next + 1))
    onPageChange(next)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[11px] text-muted-foreground">
        {rangeStart}–{rangeEnd} of {total}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || safePage <= 0}
          onClick={() => onPageChange(Math.max(0, safePage - 1))}
        >
          Previous
        </Button>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            goToInputPage()
          }}
        >
          <label
            htmlFor="community-page-jump"
            className="text-[11px] text-muted-foreground"
          >
            Page
          </label>
          <Input
            id="community-page-jump"
            className="h-8 w-14 text-center text-xs tabular-nums"
            inputMode="numeric"
            value={pageInput}
            disabled={loading}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={goToInputPage}
            aria-label={`Page number, 1 to ${pageCount}`}
          />
          <span className="text-[11px] tabular-nums text-muted-foreground">
            / {pageCount}
          </span>
          <Button type="submit" size="sm" variant="ghost" disabled={loading}>
            Go
          </Button>
        </form>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading || safePage >= pageCount - 1}
          onClick={() => onPageChange(Math.min(pageCount - 1, safePage + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

export function CommunityBuildsPanel() {
  const [builds, setBuilds] = useState<PublicBuild[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState("")
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SortMode>("newest")
  const [gender, setGender] = useState<GenderFilter>("any")
  const [prioritize, setPrioritize] = useState<PlannerStatKey[]>([])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [caps, setCaps] = useState<CapKey[]>([])
  const [advancedDraft, setAdvancedDraft] =
    useState<AdvancedDraft>(EMPTY_DRAFT)
  const [advanced, setAdvanced] = useState<AdvancedApplied>(EMPTY_APPLIED)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const advancedActive = useMemo(
    () => advancedIsActive(advanced, caps),
    [advanced, caps]
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        sort,
      })
      if (query.trim()) params.set("q", query.trim())
      if (gender !== "any") params.set("gender", gender)
      if (prioritize.length > 0) {
        params.set("prioritize", prioritize.join(","))
      }
      for (const cap of caps) params.append("cap", cap)
      for (const [key, value] of Object.entries(advanced.mins) as Array<
        [PlannerStatKey, number]
      >) {
        const param = MIN_PARAM[key]
        if (param) params.set(param, String(value))
      }
      if (advanced.maxIncant != null) {
        params.set("maxIncant", String(advanced.maxIncant))
      }
      if (advanced.maxCooldown != null) {
        params.set("maxCooldown", String(advanced.maxCooldown))
      }
      if (advanced.minLikes != null) {
        params.set("minLikes", String(advanced.minLikes))
      }
      if (advanced.minLevel != null) {
        params.set("minLevel", String(advanced.minLevel))
      }
      const res = await fetch(`/api/builder/builds/public?${params}`)
      const json = (await res.json()) as {
        data?: { builds?: PublicBuild[]; total?: number }
        message?: string
      }
      if (!res.ok) {
        setError(json.message ?? "Failed to load builds")
        setBuilds([])
        setTotal(0)
        return
      }
      const nextTotal = json.data?.total ?? 0
      const maxPage = Math.max(0, Math.ceil(nextTotal / PAGE_SIZE) - 1)
      if (page > maxPage) {
        setPage(maxPage)
        return
      }
      setBuilds(json.data?.builds ?? [])
      setTotal(nextTotal)
    } catch {
      setError("Failed to load builds")
      setBuilds([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [query, sort, gender, prioritize, caps, advanced, page])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const resetFiltersToFirstPage = () => setPage(0)

  const togglePrioritize = (key: PlannerStatKey) => {
    resetFiltersToFirstPage()
    setPrioritize((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  const toggleCap = (key: CapKey) => {
    resetFiltersToFirstPage()
    setCaps((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    )
  }

  const applyAdvanced = () => {
    resetFiltersToFirstPage()
    setAdvanced(draftToApplied(advancedDraft))
  }

  const clearAdvanced = () => {
    resetFiltersToFirstPage()
    setCaps([])
    setAdvancedDraft(EMPTY_DRAFT)
    setAdvanced(EMPTY_APPLIED)
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-3 sm:p-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-[0.1em] uppercase sm:text-3xl">
              Community builds
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">
              Browse published loadouts like a workshop. Toggle stats to rank by
              highest values; open Advanced for mins, at-cap, likes, and level.
              Combat chips are builder matrix stats only.
            </p>
          </div>
          <Link
            href="/builder"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "no-underline uppercase tracking-wider"
            )}
          >
            Open builder
          </Link>
        </div>

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            resetFiltersToFirstPage()
            setQuery(q)
          }}
        >
          <Field className="min-w-[12rem] flex-1">
            <FieldLabel htmlFor="community-build-q">Search</FieldLabel>
            <Input
              id="community-build-q"
              className="h-8 text-xs"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Build title"
            />
          </Field>
          <Button type="submit" size="sm" variant="outline" disabled={loading}>
            Search
          </Button>
          {query ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={loading}
              onClick={() => {
                resetFiltersToFirstPage()
                setQ("")
                setQuery("")
              }}
            >
              Clear
            </Button>
          ) : null}
        </form>

        <div className="space-y-2 border border-border bg-card/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Sort
            </span>
            {(
              [
                ["newest", "Newest"],
                ["liked", "Most liked"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="xs"
                variant={sort === value ? "default" : "outline"}
                onClick={() => {
                  resetFiltersToFirstPage()
                  setSort(value)
                }}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Gender
            </span>
            {(
              [
                ["any", "Any"],
                ["male", "Male"],
                ["female", "Female"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="xs"
                variant={gender === value ? "default" : "outline"}
                onClick={() => {
                  resetFiltersToFirstPage()
                  setGender(value)
                }}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Prioritize
              </span>
              {PLANNER_STATS.map((opt) => {
                const key = opt.key as PlannerStatKey
                return (
                  <Button
                    key={key}
                    type="button"
                    size="xs"
                    variant={prioritize.includes(key) ? "default" : "outline"}
                    onClick={() => togglePrioritize(key)}
                    title={`Rank higher ${opt.label}`}
                  >
                    {opt.abbr}
                  </Button>
                )
              })}
            </div>
            {prioritize.length > 0 ? (
              <p className="text-[10px] text-muted-foreground">
                Ranking by selected stats (sum). Newest / Most liked is
                tie-break only.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="xs"
              variant={advancedOpen || advancedActive ? "default" : "outline"}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              {advancedOpen ? "Hide advanced" : "Advanced"}
              {advancedActive && !advancedOpen ? " · on" : ""}
            </Button>
            {advancedActive ? (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={clearAdvanced}
              >
                Clear advanced
              </Button>
            ) : null}
          </div>

          {advancedOpen ? (
            <div className="space-y-3 border-t border-border/60 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  At cap
                </span>
                {CAP_OPTIONS.map((opt) => (
                  <Button
                    key={opt.key}
                    type="button"
                    size="xs"
                    variant={caps.includes(opt.key) ? "default" : "outline"}
                    onClick={() => toggleCap(opt.key)}
                    title={`Require ${opt.label} at practical cap`}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {PLANNER_STATS.filter((s) => s.kind !== "reduction").map(
                  (opt) => {
                    const key = opt.key as PlannerStatKey
                    return (
                      <Field key={key}>
                        <FieldLabel htmlFor={`community-min-${key}`}>
                          Min {opt.abbr}
                        </FieldLabel>
                        <Input
                          id={`community-min-${key}`}
                          className="h-8 text-xs"
                          inputMode="numeric"
                          value={advancedDraft.mins[key] ?? ""}
                          onChange={(e) =>
                            setAdvancedDraft((prev) => ({
                              ...prev,
                              mins: { ...prev.mins, [key]: e.target.value },
                            }))
                          }
                          placeholder="any"
                        />
                      </Field>
                    )
                  }
                )}
                <Field>
                  <FieldLabel htmlFor="community-max-incant">
                    Max Incant %
                  </FieldLabel>
                  <Input
                    id="community-max-incant"
                    className="h-8 text-xs"
                    inputMode="numeric"
                    value={advancedDraft.maxIncant}
                    onChange={(e) =>
                      setAdvancedDraft((prev) => ({
                        ...prev,
                        maxIncant: e.target.value,
                      }))
                    }
                    placeholder="remaining"
                    title="Maximum remaining incantation % (0 = fully reduced)"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="community-max-cd">Max CD %</FieldLabel>
                  <Input
                    id="community-max-cd"
                    className="h-8 text-xs"
                    inputMode="numeric"
                    value={advancedDraft.maxCooldown}
                    onChange={(e) =>
                      setAdvancedDraft((prev) => ({
                        ...prev,
                        maxCooldown: e.target.value,
                      }))
                    }
                    placeholder="remaining"
                    title="Maximum remaining cooldown % (0 = fully reduced)"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="community-min-likes">
                    Min likes
                  </FieldLabel>
                  <Input
                    id="community-min-likes"
                    className="h-8 text-xs"
                    inputMode="numeric"
                    value={advancedDraft.minLikes}
                    onChange={(e) =>
                      setAdvancedDraft((prev) => ({
                        ...prev,
                        minLikes: e.target.value,
                      }))
                    }
                    placeholder="any"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="community-min-level">
                    Min level
                  </FieldLabel>
                  <Input
                    id="community-min-level"
                    className="h-8 text-xs"
                    inputMode="numeric"
                    value={advancedDraft.minLevel}
                    onChange={(e) =>
                      setAdvancedDraft((prev) => ({
                        ...prev,
                        minLevel: e.target.value,
                      }))
                    }
                    placeholder="any"
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={applyAdvanced}
                >
                  Apply advanced
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading builds…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : builds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No builds match these filters. Loosen advanced filters/gender or
          publish a new loadout from the builder.
        </p>
      ) : (
        <>
          <CommunityPagination
            total={total}
            page={page}
            loading={loading}
            onPageChange={setPage}
          />
          <ul className="space-y-3">
            {builds.map((b) => (
              <li
                key={b.id}
                className="border border-border bg-card/40 px-3 py-3 sm:px-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <Link
                        href={b.path}
                        className="font-heading text-base font-semibold tracking-[0.06em] text-[#c9a0ff] no-underline uppercase hover:text-gold-hot sm:text-lg"
                      >
                        {b.name}
                      </Link>
                      {b.summary ? (
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <GenderMark gender={b.summary.gender} />
                          <span>Lv {b.summary.level}</span>
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      by {b.username} ·{" "}
                      {new Date(b.publishedAt).toLocaleDateString()}
                    </p>
                    {b.summary?.bonuses?.length ? (
                      <CombatBonusChips bonuses={b.summary.bonuses} />
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                    <BuildLikeButton
                      buildId={b.id}
                      likeCount={b.likeCount ?? 0}
                      likedByMe={Boolean(b.likedByMe)}
                    />
                    <Link
                      href={b.path}
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                        "no-underline"
                      )}
                    >
                      Open
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <CommunityPagination
            total={total}
            page={page}
            loading={loading}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  )
}
